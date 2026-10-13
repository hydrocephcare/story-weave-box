// Reads pages aloud in YOUR voice with Voicebox (free, runs on this computer) and puts the audio on the site, so the Listen button plays it.
//
//   1. Install Voicebox (github.com/jamiepine/voicebox), add a voice profile from 20-30 seconds of you reading, and keep the app open.
//   2. In this folder:   set ADMIN_EMAIL=you@example.com   and   set ADMIN_PASSWORD=your-site-password        (PowerShell: $env:ADMIN_EMAIL="...")
//   3. node scripts/voice/make-audio.mjs --profile "Abongo" --top 20            the 20 most-used topic pages
//      node scripts/voice/make-audio.mjs --profile "Abongo" --topic heart,anaemia
//      node scripts/voice/make-audio.mjs --profile "Abongo" --note ectopic-pregnancy
//      add --force to redo a page that already has audio.   Nothing is uploaded until the audio for a page is complete.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const arg = (n, d = "") => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? (process.argv[i + 1] ?? "true") : d; };
const BASE = arg("voicebox", "http://127.0.0.1:17493");
const SITE = "https://www.ompathstudy.com";
const SB = "https://lkgfzjwhmfjvntzphbsh.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrZ2Z6andobWZqdm50enBoYnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3Nzk5MjIsImV4cCI6MjA4NzM1NTkyMn0.a2QY6TxzKNM2AhuuoDkgdKifI3XhSGhYRlhpqZpvAwo";
const keyOf = (p) => p.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 90).toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Voicebox -------------------------------------------------------------------------------------------------------------------------
async function profileId(name) {
  const r = await fetch(`${BASE}/profiles`).catch(() => null);
  if (!r?.ok) throw new Error(`Voicebox is not answering at ${BASE}. Open the Voicebox app and try again.`);
  const j = await r.json();
  const list = Array.isArray(j) ? j : j.profiles ?? [];
  const hit = list.find((p) => String(p.name ?? p.id).toLowerCase() === name.toLowerCase()) ?? (list.length === 1 ? list[0] : null);
  if (!hit) throw new Error(`No voice profile called "${name}". Profiles found: ${list.map((p) => p.name ?? p.id).join(", ") || "none"}.`);
  return hit.id ?? hit.profile_id;
}
const isAudio = (r) => /audio|octet-stream/.test(r.headers.get("content-type") ?? "");
async function speak(text, id) {
  const r = await fetch(`${BASE}/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, profile_id: id, language: "en" }) });
  if (!r.ok) throw new Error(`Voicebox said ${r.status}: ${(await r.text()).slice(0, 200)}`);
  if (isAudio(r)) return Buffer.from(await r.arrayBuffer());
  // Voicebox answers with a job and makes the audio in the background: wait until it is done, then download it
  const j = await r.json();
  const gid = j.id ?? j.generation_id;
  if (!gid) throw new Error(`Voicebox gave no job id: ${JSON.stringify(j).slice(0, 300)}`);
  for (let attempt = 0; attempt < 400; attempt++) {
    await sleep(1500);
    const st = await fetch(`${BASE}/generate/${gid}/status`).then((x) => (x.ok ? x.text() : "")).catch(() => "");
    if (/"status"s*:s*"(failed|error|cancelled)"/i.test(st)) throw new Error(`Voicebox could not make this part: ${st.slice(0, 200)}`);
    if (/"status"s*:s*"(completed|complete|done|ready)"/i.test(st) || attempt % 5 === 4) {
      const a = await fetch(`${BASE}/audio/${gid}`).catch(() => null);
      if (a?.ok && isAudio(a)) return Buffer.from(await a.arrayBuffer());
    }
  }
  throw new Error("Voicebox took too long on one part.");
}

// ---- joining audio: WAV pieces get real silence between them; MP3 pieces are simply joined ---------------------------------------------
function wavInfo(b) {
  if (b.toString("ascii", 0, 4) !== "RIFF") return null;
  let p = 12, fmt = null;
  while (p + 8 <= b.length) {
    const id = b.toString("ascii", p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === "fmt ") fmt = { channels: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === "data") return { ...fmt, data: b.subarray(p + 8, Math.min(b.length, p + 8 + size)) };
    p += 8 + size + (size % 2);
  }
  return null;
}
function joinAudio(parts) {
  const wavs = parts.map((p) => ({ info: wavInfo(p.audio), pause: p.pause }));
  if (wavs.every((w) => w.info)) {
    const f = wavs[0].info;
    const bytesPerSec = f.rate * f.channels * (f.bits / 8);
    const chunks = [];
    for (const w of wavs) { chunks.push(w.info.data); const n = Math.round((bytesPerSec * w.pause) / 1000); chunks.push(Buffer.alloc(n - (n % (f.channels * (f.bits / 8))))); }
    const data = Buffer.concat(chunks);
    const h = Buffer.alloc(44);
    h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(f.channels, 22);
    h.writeUInt32LE(f.rate, 24); h.writeUInt32LE(bytesPerSec, 28); h.writeUInt16LE(f.channels * (f.bits / 8), 32); h.writeUInt16LE(f.bits, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
    return { ext: "wav", bytes: Buffer.concat([h, data]) };
  }
  return { ext: "mp3", bytes: Buffer.concat(parts.map((p) => p.audio)) };
}

// ---- what is read: titles on their own line (with a pause after), then paragraphs --------------------------------------------------------
function script(lines) {
  const out = [];
  for (const raw of lines) {
    const p = raw.replace(/\s+/g, " ").trim(); if (!p) continue;
    const heading = p.length < 70 && !/[.!?:]$/.test(p);
    if (heading) { out.push({ t: `${p}.`, pause: 800 }); continue; }
    const sents = p.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [p];
    let cur = "";
    for (const s of sents) { if (cur && (cur + s).length > 600) { out.push({ t: cur.trim(), pause: 350 }); cur = s; } else cur += s; }
    if (cur.trim()) out.push({ t: cur.trim(), pause: 650 });
  }
  return out;
}
const topicLines = (t) => { const a = t.ai; if (!a) return null; return [t.n, a.summary, ...a.sections.flatMap((s) => [s.h, s.p, ...(s.b ?? [])])].filter(Boolean); };
async function pageOf(kind, slug) {
  if (kind === "topic") { const r = await fetch(`${SITE}/topics/${slug}.json`); if (!r.ok) return null; const t = await r.json(); const lines = topicLines(t); return lines ? { path: `/topic/${slug}`, lines } : null; }
  const meta = JSON.parse(fs.readFileSync("src/data/staticNotes.json", "utf8")).find((n) => n.slug === slug);
  if (!meta) return null;
  const md = fs.readFileSync(meta.file, "utf8").replace(/^---[\s\S]*?---\n/, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  const lines = md.split(/\n+/).map((l) => l.replace(/^#{1,4}\s*/, "").replace(/^\s*[-*]\s+/, "").replace(/[*_`|]/g, "").trim()).filter((l) => l && !/^[-: |]+$/.test(l));
  return { path: `/notes/${slug}`, lines: [meta.title, ...lines] };
}

// ---- go ----------------------------------------------------------------------------------------------------------------------------------
const profile = arg("profile");
if (!profile) { console.log('Say which voice profile to use, e.g. --profile "Abongo".'); process.exit(1); }
const email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD, token = process.env.ADMIN_TOKEN;
if (!token && (!email || !password)) { console.log("Set ADMIN_TOKEN (copied from the signed-in site), or ADMIN_EMAIL and ADMIN_PASSWORD."); process.exit(1); }
const sb = createClient(SB, ANON, token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : undefined);
if (!token) {
  const { error: authError } = await sb.auth.signInWithPassword({ email, password });
  if (authError) { console.log(`Could not sign in: ${authError.message}`); process.exit(1); }
}

const id = await profileId(profile);
const todo = [];
if (arg("topic")) for (const s of arg("topic").split(",")) todo.push(["topic", s.trim()]);
if (arg("note")) for (const s of arg("note").split(",")) todo.push(["note", s.trim()]);
if (arg("top")) {
  const index = await (await fetch(`${SITE}/topics/index.json`)).json();
  for (const t of index.filter((x) => x.ai).sort((a, b) => b.d - a.d).slice(0, Number(arg("top")))) todo.push(["topic", t.s]);
}
if (!todo.length) { console.log("Nothing chosen. Use --top 20, --topic heart or --note ectopic-pregnancy."); process.exit(1); }

for (const [kind, slug] of todo) {
  const page = await pageOf(kind, slug).catch(() => null);
  if (!page) { console.log(`skip ${slug}: no written page yet`); continue; }
  const key = keyOf(page.path);
  if (!process.argv.includes("--force")) {
    const have = await Promise.all(["mp3", "wav"].map((e) => fetch(`${SB}/storage/v1/object/public/page-audio/${key}.${e}`, { method: "HEAD" }).then((r) => r.ok).catch(() => false)));
    if (have.some(Boolean)) { console.log(`skip ${slug}: already has audio`); continue; }
  }
  const pieces = script(page.lines);
  console.log(`${slug}: ${pieces.length} parts`);
  try {
    const parts = [];
    for (let i = 0; i < pieces.length; i++) { process.stdout.write(`  ${i + 1}/${pieces.length}\r`); parts.push({ audio: await speak(pieces[i].t, id), pause: pieces[i].pause }); }
    const { ext, bytes } = joinAudio(parts);
    const { error } = await sb.storage.from("page-audio").upload(`${key}.${ext}`, bytes, { upsert: true, contentType: ext === "wav" ? "audio/wav" : "audio/mpeg", cacheControl: "300" });
    if (error) throw error;
    console.log(`  saved ${key}.${ext} (${(bytes.length / 1e6).toFixed(1)} MB)`);
  } catch (e) { console.log(`  failed: ${e.message}`); }
}
console.log("Done. Open a page you did and tap Listen.");
