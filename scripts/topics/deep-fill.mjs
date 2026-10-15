// Writes the deep exam notes ahead of time for topic pages that already have a revision page, a few each day, so search engines and readers
// find them without anyone spending credits at the moment of reading. Runs in the daily workflow after the revision pages.
//   node scripts/topics/deep-fill.mjs [count]
// Reads and writes src/data/topicAi/<slug>.json (adds a "deep" key). Most-used topics first. Stops by itself when the AI keys run out.
import fs from "node:fs";
import path from "node:path";
import { generateDeepWithFallback } from "../../supabase/functions/_shared/topicAi.js";
import { checkContent } from "../../supabase/functions/_shared/contentCheck.js";

const DIR = "src/data/topicAi";
const COUNT = Number(process.argv.find((a) => /^\d+$/.test(a)) || 10);
const local = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(",") : "");
const env = { GEMINI_API_KEYS: [process.env.GEMINI_API_KEYS, local(".gemini-keys.local")].filter(Boolean).join(","), GROQ_API_KEYS: [process.env.GROQ_API_KEYS, local(".groq-keys.local")].filter(Boolean).join(",") };
if (!env.GEMINI_API_KEYS && !env.GROQ_API_KEYS) { console.log("No AI keys set: nothing to do."); process.exit(0); }
if (!fs.existsSync("public/topics/index.json") || !fs.existsSync(DIR)) { console.log("No topic pages yet."); process.exit(0); }

const index = JSON.parse(fs.readFileSync("public/topics/index.json", "utf8"));
const weight = new Map(index.map((t) => [t.s, (t.d ?? 0) + (t.q ?? 0) * 2 + (t.i ?? 0)]));
const names = new Map(index.map((t) => [t.s, t]));
const todo = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
  .filter((slug) => { try { const p = JSON.parse(fs.readFileSync(path.join(DIR, `${slug}.json`), "utf8")); return p.medical !== false && Array.isArray(p.sections) && p.sections.length >= 3 && !p.deep; } catch { return false; } })
  .sort((a, b) => (weight.get(b) ?? 0) - (weight.get(a) ?? 0)).slice(0, COUNT);
console.log(`${todo.length} topic(s) get deep notes today.`);

let written = 0, misses = 0;
for (const slug of todo) {
  const file = path.join(DIR, `${slug}.json`);
  const page = JSON.parse(fs.readFileSync(file, "utf8"));
  const t = names.get(slug);
  try {
    const deep = await generateDeepWithFallback({ name: t?.n ?? page.title ?? slug.replace(/-/g, " "), category: t?.c ?? page.subject ?? "", base: page }, env);
    // a second AI reads the deep notes before they are saved: anything with a serious error is not published
    const text = [...deep.sections.map((x) => `## ${x.h}\n${x.p ?? ""}\n${(x.b ?? []).join("\n")}\n${(x.t ?? []).map((r) => `${r.a}: ${r.b}`).join("\n")}`), `## Examiner questions\n${deep.exam.join("\n")}`].join("\n\n");
    const check = await checkContent({ title: t?.n ?? slug, kind: "deep exam notes", text, env });
    if (!check.validated) { console.log(`held back ${slug}: ${check.issues.filter((i) => i.severity === "high").map((i) => i.problem).join(" | ").slice(0, 300)}`); continue; }
    fs.writeFileSync(file, JSON.stringify({ ...page, deep: { ...deep, checked: check.at } }, null, 1) + "\n");
    written++; misses = 0;
    console.log(`deep notes: ${slug}`);
  } catch (e) {
    console.log(`failed ${slug}: ${e.message}`);
    if (++misses >= 3) { console.log("Three failures in a row: the AI keys are probably out of credits. Stopping until tomorrow."); break; }
  }
}
console.log(`${written} deep note set(s) written.`);
