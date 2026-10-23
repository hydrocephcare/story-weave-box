// Restores blog posts from the 12 October snapshots into the original Supabase project (which stopped receiving edits on 26 September).
//   node scripts/imed/restore-articles.mjs <live.json> <fresh.json>             -> dry run: shows what it WOULD change, writes nothing
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/imed/restore-articles.mjs <live.json> <fresh.json> --apply
// Rules: a post that exists in both gets the snapshot's cleaned text/title/category (the project's copy is older); a post only in a snapshot is added;
// nothing is ever deleted, and every changed post's previous text is saved to restore-backup-<time>.json first, so the run can be reversed.
import fs from "node:fs";

const URL_ = process.env.SUPABASE_URL || "https://strfwaqvxvkhjbqrwmla.supabase.co";
const PUB = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0cmZ3YXF2eHZraGpicXJ3bWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MTIwNzEsImV4cCI6MjEwODI4ODA3MX0.F_bGNSKsC6Wbriit19-OIwNdScqAUU0yhJ3TtQuiTkE";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const apply = process.argv.includes("--apply");
const [livePath, freshPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!livePath || !freshPath) { console.error("usage: node scripts/imed/restore-articles.mjs <live.json> <fresh.json> [--apply]"); process.exit(1); }
if (apply && !SERVICE) { console.error("--apply needs SUPABASE_SERVICE_ROLE_KEY in the environment (Supabase dashboard > Project Settings > API > service_role)."); process.exit(1); }

const key = apply ? SERVICE : PUB;
const H = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
const live = JSON.parse(fs.readFileSync(livePath, "utf8")), fresh = JSON.parse(fs.readFileSync(freshPath, "utf8"));
const snap = new Map();
for (const a of fresh) snap.set(a.id, { ...a });
for (const a of live) snap.set(a.id, { ...(snap.get(a.id) || {}), ...a });   // live.json is the later snapshot and carries slugs

async function get(q) { for (let i = 0; i < 4; i++) { const r = await fetch(`${URL_}/rest/v1/articles?${q}`, { headers: H }); if (r.ok) return r.json(); await new Promise((x) => setTimeout(x, 1500)); } throw new Error("read failed: " + q); }
const db = new Map();
for (let off = 0; off < 3000; off += 40) { const page = await get(`select=id,title,slug,category,content,published,deleted_at,updated_at&order=created_at&limit=40&offset=${off}`); for (const r of page) db.set(r.id, r); if (page.length < 40) break; }
console.log(`project now: ${db.size} posts | snapshots: ${snap.size} posts`);

const toUpdate = [], toInsert = [];
for (const [id, s] of snap) {
  const cur = db.get(id);
  if (!cur) { if (s.content && s.title) toInsert.push(s); continue; }
  const changes = {};
  if (s.content && s.content.trim() !== (cur.content || "").trim()) changes.content = s.content;
  if (s.title && s.title !== cur.title) changes.title = s.title;
  if (s.category && s.category !== cur.category) changes.category = s.category;
  if (s.slug && s.slug !== cur.slug) changes.slug = s.slug;
  if (s.deleted_at && !cur.deleted_at) changes.deleted_at = s.deleted_at;
  if (Object.keys(changes).length) toUpdate.push({ id, before: { content: cur.content, title: cur.title, category: cur.category, slug: cur.slug, deleted_at: cur.deleted_at }, changes });
}
console.log(`would UPDATE ${toUpdate.length} posts (cleaned text / title / category / slug) and ADD ${toInsert.length} posts that exist only in the snapshots`);
for (const u of toUpdate.slice(0, 4)) console.log("  update:", u.id.slice(0, 8), Object.keys(u.changes).join(","), "|", (u.changes.title || u.before.title || "").slice(0, 50));
for (const s of toInsert.slice(0, 4)) console.log("  add:   ", s.id.slice(0, 8), "|", (s.title || "").slice(0, 60), "|", s.category);

if (!apply) { console.log("\nDry run only. Nothing was written. Add --apply (with SUPABASE_SERVICE_ROLE_KEY) to do it."); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.writeFileSync(`restore-backup-${stamp}.json`, JSON.stringify({ updated: toUpdate.map((u) => ({ id: u.id, before: u.before })), added: toInsert.map((s) => s.id) }));
console.log(`saved the previous text of every changed post to restore-backup-${stamp}.json`);
let done = 0, failed = 0;
for (const u of toUpdate) {
  const r = await fetch(`${URL_}/rest/v1/articles?id=eq.${u.id}`, { method: "PATCH", headers: { ...H, prefer: "return=minimal" }, body: JSON.stringify(u.changes) });
  if (r.ok) done++; else { failed++; if (failed < 4) console.log("  update failed:", u.id.slice(0, 8), r.status, (await r.text()).slice(0, 120)); }
}
for (let i = 0; i < toInsert.length; i += 15) {
  const batch = toInsert.slice(i, i + 15).map((s) => ({ id: s.id, title: s.title, content: s.content, category: s.category ?? null, slug: s.slug ?? null, published: s.published ?? true, created_at: s.created_at, deleted_at: s.deleted_at ?? null }));
  const r = await fetch(`${URL_}/rest/v1/articles`, { method: "POST", headers: { ...H, prefer: "return=minimal,resolution=ignore-duplicates" }, body: JSON.stringify(batch) });
  if (r.ok) done += batch.length; else { failed += batch.length; console.log("  insert failed:", r.status, (await r.text()).slice(0, 160)); }
}
console.log(`done: ${done} written, ${failed} failed.`);
