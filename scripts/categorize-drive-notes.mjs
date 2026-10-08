// Sorts the notes in the Google Drive notes folder into Year > Unit, with the AI, so the "Latest notes" page stays organised.
// Runs every week (.github/workflows/categorize-notes.yml) and can be run by hand:  node scripts/categorize-drive-notes.mjs [--all]
//
//   1. list every file in the public Drive folder (same reader the site uses)
//   2. keep what was already sorted; only NEW files (or all, with --all) go to the AI
//   3. for a .docx / .pptx the first lines of text are read too, so a file called "Hair.docx" can still be placed
//   4. the AI must pick a Year and one of the site's real Unit names; anything it is not sure about stays "Unsorted"
//   5. the result is saved to public/data/drive-notes-index.json, which the site reads
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFolder, kindOf } from "../api/drive-notes.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/data/drive-notes-index.json");
const FOLDER = process.env.DRIVE_NOTES_FOLDER || "1Fu3jR4bXo5zVusux-umgAXOb4Yi3qz_o";
const ALL = process.argv.includes("--all");

function env(name) {
  if (process.env[name]) return process.env[name];
  try { const m = fs.readFileSync(path.join(ROOT, ".env"), "utf8").match(new RegExp(`^${name}\\s*=\\s*"?([^"\\r\\n]+)"?`, "m")); return m?.[1] ?? ""; } catch { return ""; }
}
const SUPABASE_URL = env("VITE_SUPABASE_URL") || "https://lkgfzjwhmfjvntzphbsh.supabase.co";
const KEY = env("VITE_SUPABASE_PUBLISHABLE_KEY") || env("VITE_SUPABASE_ANON_KEY");
if (!KEY) { console.error("No Supabase key found (VITE_SUPABASE_PUBLISHABLE_KEY)."); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 1. the folder
async function crawl(id, trail, out, depth = 0) {
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(id)}`, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Drive said HTTP ${res.status} for folder ${id}. Is it shared as "Anyone with the link"?`);
  const { items } = parseFolder(await res.text());
  for (const it of items) {
    if (it.mime === "folder") { if (depth < 5) { await sleep(150); await crawl(it.id, [...trail, it.name], out, depth + 1); } }
    else if (!/shortcut/.test(it.mime) && !/^(thumbs\.db|desktop\.ini|~\$)/i.test(it.name)) out.push({ id: it.id, name: it.name, kind: kindOf(it.name, it.mime), folder: trail.join(" / "), modified: it.modified });
  }
}

// ---- the site's real units, per year
async function loadUnits() {
  const h = { apikey: KEY, Authorization: `Bearer ${KEY}` };
  const [years, units] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/academic_years?select=id,year_number`, { headers: h }).then((r) => r.json()),
    fetch(`${SUPABASE_URL}/rest/v1/units?select=name,academic_year_id&published=eq.true&order=name`, { headers: h }).then((r) => r.json()),
  ]);
  const byYear = {};
  for (const y of years) byYear[y.year_number] = units.filter((u) => u.academic_year_id === y.id).map((u) => u.name);
  return byYear;
}

// ---- 3. a little of the file's own text
async function readText(file) {
  if (!["doc", "ppt"].includes(file.kind) || !/\.(docx|pptx)$/i.test(file.name)) return "";
  try {
    const res = await fetch(`https://drive.usercontent.google.com/download?id=${file.id}&export=download&confirm=t`, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) return "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024 || buf.slice(0, 2).toString() !== "PK") return "";
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(buf);
    const names = /\.docx$/i.test(file.name) ? ["word/document.xml"] : Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide[1-3]\.xml$/.test(n));
    let text = "";
    for (const n of names) text += " " + ((await zip.file(n)?.async("string")) ?? "").replace(/<\/(w:p|a:p)>/g, "\n").replace(/<[^>]+>/g, " ");
    return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim().slice(0, 700);
  } catch { return ""; }
}

// ---- 4. the AI (the same function that powers Ompath AI; it needs no extra key)
async function ask(question, sources) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ompath-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ question, history: [], sources }),
  });
  if (!res.ok) throw new Error(`AI said HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const raw = await res.text();
  let text = "";
  for (const line of raw.split("\n")) {
    const d = line.trim();
    if (!d.startsWith("data:") || d.includes("[DONE]")) continue;
    try { text += JSON.parse(d.slice(5)).choices?.[0]?.delta?.content ?? ""; } catch { /* partial line */ }
  }
  return text;
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function matchUnit(year, unit, catalog) {
  const list = catalog[year] ?? [];
  const u = norm(String(unit ?? ""));
  if (!u) return null;
  return list.find((x) => norm(x) === u) ?? list.find((x) => norm(x).includes(u) || u.includes(norm(x))) ?? null;
}

async function classify(batch, catalog) {
  const units = Object.entries(catalog).map(([y, list]) => `Year ${y}: ${list.join("; ")}`).join("\n");
  const files = batch.map((f) => `- id: ${f.id}\n  file: ${f.name}\n  folder: ${f.folder || "(top)"}${f.text ? `\n  starts with: ${f.text}` : ""}`).join("\n");
  // the question itself is kept short (the AI service trims long questions); the lists go in as sources
  const question = `Sort the files in the source "Files to sort" into the units in the source "Valid units". Reply with ONLY a JSON array and no other words. One object per file: {"id": the file id, "year": 1-6 or null, "unit": exact unit name from Valid units or null, "type": "Notes" or "Slides" or "Past paper" or "MCQs" or "Case" or "Other", "title": clean readable title, "summary": one short sentence}. Use null for year and unit when unsure. Never invent a unit.`;
  const text = await ask(question, [
    { kind: "site", title: "Valid units", subtitle: "MBChB units by year", snippet: units },
    { kind: "site", title: "Files to sort", subtitle: "New study notes", snippet: files },
  ]);
  const json = text.match(/\[[\s\S]*\]/)?.[0];
  if (!json) throw new Error(`The AI did not return a list. It said: ${text.slice(0, 200) || "(nothing)"}`);
  return JSON.parse(json);
}

(async () => {
  const files = [];
  await crawl(FOLDER, [], files);
  console.log(`Folder has ${files.length} file(s).`);
  let index = { updated: "", files: {} };
  try { index = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch { /* first run */ }
  const today = new Date().toISOString().slice(0, 10);

  const fresh = files.filter((f) => ALL || !index.files[f.id]);
  console.log(`${fresh.length} to sort${ALL ? " (all)" : ""}.`);
  const catalog = fresh.length ? await loadUnits() : {};
  for (const f of fresh) f.text = await readText(f);

  const next = {};
  for (const f of files) if (index.files[f.id] && !ALL) next[f.id] = index.files[f.id];

  for (let i = 0; i < fresh.length; i += 8) {
    const batch = fresh.slice(i, i + 8);
    let got = [];
    for (let attempt = 0; attempt < 3 && !got.length; attempt++) {
      try { got = await classify(batch, catalog); } catch (e) { console.warn(`  batch ${i / 8 + 1}, try ${attempt + 1}: ${e.message}`); await sleep(2500 * (attempt + 1)); }
    }
    for (const f of batch) {
      const r = got.find((x) => x && x.id === f.id) ?? {};
      const year = Number(r.year) >= 1 && Number(r.year) <= 6 ? Number(r.year) : null;
      const unit = year ? matchUnit(year, r.unit, catalog) : null;
      next[f.id] = {
        year: unit ? year : null,
        unit: unit ?? null,
        type: ["Notes", "Slides", "Past paper", "MCQs", "Case", "Other"].includes(r.type) ? r.type : "Notes",
        title: typeof r.title === "string" && r.title.trim() ? r.title.trim().slice(0, 140) : f.name.replace(/\.[^.]+$/, ""),
        summary: typeof r.summary === "string" ? r.summary.trim().slice(0, 220) : "",
        firstSeen: index.files[f.id]?.firstSeen ?? today,
        sorted: Boolean(unit),
      };
      console.log(`  ${f.name}  ->  ${unit ? `Year ${year} · ${unit}` : "Unsorted"}`);
    }
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), files: next }, null, 1) + "\n");
  console.log(`Saved ${Object.keys(next).length} file(s) to ${path.relative(ROOT, OUT)}.`);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
