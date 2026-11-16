// Writes the deep exam notes ahead of time for topic pages that already have a revision page, a few each day, so search engines and readers
// find them without anyone spending credits at the moment of reading. Runs in the daily workflow after the revision pages.
//   node scripts/topics/deep-fill.mjs [count]
// Reads and writes src/data/topicAi/<slug>.json (adds a "deep" key). Most-used topics first. Stops by itself when the AI keys run out.
import fs from "node:fs";
import path from "node:path";
import { generateCheckedDeep } from "../../supabase/functions/_shared/contentCheck.js";

const DIR = "src/data/topicAi";
const COUNT = Number(process.argv.find((a) => /^\d+$/.test(a)) || 10);
const ONLY = (process.argv.find((a) => a.startsWith("--slug=")) || "").split("=")[1];
const local = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(",") : "");
const env = { GEMINI_API_KEYS: [process.env.GEMINI_API_KEYS, local(".gemini-keys.local")].filter(Boolean).join(","), GROQ_API_KEYS: [process.env.GROQ_API_KEYS, local(".groq-keys.local")].filter(Boolean).join(",") };
if (!env.GEMINI_API_KEYS && !env.GROQ_API_KEYS) { console.log("No AI keys set: nothing to do."); process.exit(0); }
if (!fs.existsSync("public/topics/index.json") || !fs.existsSync(DIR)) { console.log("No topic pages yet."); process.exit(0); }

const index = JSON.parse(fs.readFileSync("public/topics/index.json", "utf8"));
const weight = new Map(index.map((t) => [t.s, (t.d ?? 0) + (t.q ?? 0) * 2 + (t.i ?? 0)]));
const names = new Map(index.map((t) => [t.s, t]));
const todo = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
  .filter((slug) => !ONLY || slug === ONLY)
  .filter((slug) => { try { const p = JSON.parse(fs.readFileSync(path.join(DIR, `${slug}.json`), "utf8")); return p.medical !== false && Array.isArray(p.sections) && p.sections.length >= 3 && (!p.deep || !p.deep.vivas); } catch { return false; } })
  .sort((a, b) => (weight.get(b) ?? 0) - (weight.get(a) ?? 0)).slice(0, COUNT);
console.log(`${todo.length} topic(s) get deep notes today.`);

let written = 0, misses = 0;
for (const slug of todo) {
  const file = path.join(DIR, `${slug}.json`);
  const page = JSON.parse(fs.readFileSync(file, "utf8"));
  const t = names.get(slug);
  try {
    const full = fs.existsSync(path.join("public/topics", `${slug}.json`)) ? JSON.parse(fs.readFileSync(path.join("public/topics", `${slug}.json`), "utf8")) : {};
    const past = [...(full.qs ?? []).map((x) => x.q), ...(full.es ?? []).map((x) => x.q)].slice(0, 12);
    const deep = await generateCheckedDeep({ name: t?.n ?? page.title ?? slug.replace(/-/g, " "), category: t?.c ?? page.subject ?? "", base: page, past }, env);
    // the notes were cross-checked (and repaired once if needed) inside generateCheckedDeep; a serious error left over throws and nothing is saved
    fs.writeFileSync(file, JSON.stringify({ ...page, deep: deep }, null, 1) + "\n");
    written++; misses = 0;
    console.log(`deep notes: ${slug}`);
  } catch (e) {
    console.log(`failed ${slug}: ${e.message}`);
    if (++misses >= 3) { console.log("Three failures in a row: the AI keys are probably out of credits. Stopping until tomorrow."); break; }
  }
}
console.log(`${written} deep note set(s) written.`);
