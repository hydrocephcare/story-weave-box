// Writes a three-line summary and key terms for every note and blog that has none yet, a few at a time (Groq first, Gemini as the backup).
// Result: src/data/pageSummaries.json  { "n:<note slug>" | "a:<article slug>": { s: "summary", t: ["term", ...] } }
//   node scripts/summaries/fill.mjs [count] [--parallel=3]
import fs from "node:fs";
import { askModel } from "../../supabase/functions/_shared/topicAi.js";

const FILE = "src/data/pageSummaries.json";
const COUNT = Number(process.argv.find((a) => /^\d+$/.test(a)) || 40);
const PAR = Number((process.argv.find((a) => a.startsWith("--parallel=")) || "--parallel=3").split("=")[1]);
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(",") : "");
const env = { GROQ_API_KEYS: [process.env.GROQ_API_KEYS, read(".groq-keys.local")].filter(Boolean).join(","), GEMINI_API_KEYS: [process.env.GEMINI_API_KEYS, read(".gemini-keys.local")].filter(Boolean).join(",") };
if (!env.GROQ_API_KEYS && !env.GEMINI_API_KEYS) { console.log("No AI keys: nothing to do."); process.exit(0); }
const SB = "https://dekyjrfwvavtoivqivno.supabase.co";
const ANON = "sb_publishable_jOXeiFMWJj1z_M-zShimXA_cG9f2QxL";

const have = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {};
const plain = (t) => String(t ?? "").replace(/<[^>]+>/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_#>`|]/g, " ").replace(/\s+/g, " ").trim();

const todo = [];
// the study notes first (they are the newest and the most read), then the blogs of years 2 and 3 that are not past papers
for (const n of JSON.parse(fs.readFileSync("src/data/staticNotes.json", "utf8"))) {
  if (have[`n:${n.slug}`] || n.paper) continue;
  const md = fs.existsSync(n.file) ? fs.readFileSync(n.file, "utf8") : "";
  todo.push({ key: `n:${n.slug}`, title: n.title, where: `Year ${n.year} · ${n.unit}`, text: plain(md) });
}
try {
  for (let from = 0; from < 2000; from += 200) {
    const r = await fetch(`${SB}/rest/v1/articles?select=id,slug,title,category,content&published=eq.true&deleted_at=is.null&order=created_at.desc&offset=${from}&limit=200`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    if (!r.ok) break;
    const rows = await r.json();
    for (const a of rows) {
      if (!a.slug || have[`a:${a.slug}`] || /^stories/i.test(a.category || "")) continue;
      const text = plain(a.content);
      if (text.length < 600) continue;
      todo.push({ key: `a:${a.slug}`, title: a.title, where: a.category || "", text, paper: /past paper|questions & answers|exam|cat\b/i.test(a.title) });
    }
    if (rows.length < 200) break;
  }
} catch (e) { console.log("could not read the blogs:", e.message); }
todo.sort((a, b) => Number(Boolean(a.paper)) - Number(Boolean(b.paper)));
const batch = todo.slice(0, COUNT);
console.log(`${todo.length} pages still need a summary; writing ${batch.length}.`);

const PROMPT = (p) => `You write the short "in a nutshell" for a medical study page.
Page: "${p.title}" (${p.where}).
${p.paper ? "This is a past paper or question set: say what it tests and which topics it covers." : "Say what the page teaches and why it matters to a medical student."}
Return ONLY JSON: {"summary":"2 or 3 plain sentences, 55 words at most, no hype, no drug doses","terms":["5 to 7 key terms from the page"]}

PAGE TEXT:
"""
${p.text.slice(0, 3200)}
"""`;

async function ask(prompt) {
  if (env.GROQ_API_KEYS) { try { return await askModel(prompt, { env: { GROQ_API_KEYS: env.GROQ_API_KEYS }, timeoutMs: 40000, maxTokens: 900 }); } catch (e) { if (!globalThis.__g) { globalThis.__g = 1; console.log("groq said:", String(e.message).slice(0, 120)); } } }
  return askModel(prompt, { env, timeoutMs: 40000, maxTokens: 900 });
}

let next = 0, done = 0, failed = 0;
async function worker() {
  while (next < batch.length) {
    const p = batch[next++];
    try {
      const { text } = await ask(PROMPT(p));
      const j = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
      const s = String(j.summary ?? "").replace(/\s+/g, " ").trim();
      const t = (Array.isArray(j.terms) ? j.terms : []).map((x) => String(x).trim()).filter((x) => x.length >= 3 && x.length <= 40).slice(0, 7);
      if (s.length < 40 || s.length > 420 || /\d+\s?(mg|mcg|g)\b/i.test(s)) throw new Error("unusable");
      have[p.key] = { s, t };
      done++;
      if (done % 10 === 0) { fs.writeFileSync(FILE, JSON.stringify(have)); console.log(`done ${done}/${batch.length}`); }
    } catch (e) { failed++; if (failed <= 3) console.log("fail:", p.key, String(e.message).slice(0, 100)); }
  }
}
await Promise.all(Array.from({ length: PAR }, worker));
fs.writeFileSync(FILE, JSON.stringify(have));
console.log(`finished: ${done} written, ${failed} failed, ${Object.keys(have).length} summaries in total.`);
