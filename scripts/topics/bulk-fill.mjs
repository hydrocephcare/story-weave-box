// Groq drafts topic pages; Gemini independently reviews them before they are saved.
// Keys: GROQ_API_KEYS for generation and GEMINI_API_KEYS for independent review (local key files are never committed).
// Pages go to src/data/topicAi/<slug>.json and are folded into the static pages by build-topics.mjs.
//   node scripts/topics/bulk-fill.mjs [count] [--parallel=4]
import fs from "node:fs";
import path from "node:path";
import { generateReviewedTopicPage } from "../../supabase/functions/_shared/topicAi.js";

const DIR = "src/data/topicAi";
const COUNT = Number(process.argv.find((a) => /^\d+$/.test(a)) || 1000);
const PAR = Number((process.argv.find((a) => a.startsWith("--parallel=")) || "--parallel=4").split("=")[1]);
const local = fs.existsSync(".gemini-keys.local") ? fs.readFileSync(".gemini-keys.local", "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(",") : "";
const groq = fs.existsSync(".groq-keys.local") ? fs.readFileSync(".groq-keys.local", "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(",") : "";
const env = { GEMINI_API_KEYS: [process.env.GEMINI_API_KEYS, local].filter(Boolean).join(","), GROQ_API_KEYS: [process.env.GROQ_API_KEYS, groq].filter(Boolean).join(",") };
if (!env.GEMINI_API_KEYS || !env.GROQ_API_KEYS) throw new Error("Both GROQ_API_KEYS and GEMINI_API_KEYS are required; no pages were written.");
fs.mkdirSync(DIR, { recursive: true });

const index = JSON.parse(fs.readFileSync("public/topics/index.json", "utf8"));
const todo = index.filter((t) => {
  const file = path.join(DIR, `${t.s}.json`);
  if (!fs.existsSync(file)) return !t.ai;
  try {
    const p = JSON.parse(fs.readFileSync(file, "utf8"));
    if (p.medical === false) return false;
    const ready = p.aiReview?.status === "passed" && (p.sections?.length || 0) >= 9 && (p.exam?.length || 0) >= 8 && (p.faq?.length || 0) >= 3 && Boolean(p.summary);
    return !ready;
  } catch { return true; }
}).sort((a, b) => (b.d + b.q * 2 + b.i) - (a.d + a.q * 2 + a.i)).slice(0, COUNT);
console.log(`${todo.length} new or thin/unverified topics to write, ${PAR} at a time`);
const contextOf = (t, p = {}) => [t.lead?.t, ...(t.sec ?? []).flatMap((s) => [s.h, ...s.b]), ...(t.snip ?? []).map((s) => s.t), p.summary, ...(p.sections ?? []).flatMap((s) => [s.h, ...(s.b ?? [])]), ...(p.exam ?? [])].filter(Boolean).join("\n").slice(0, 5000);

let done = 0, skipped = 0, failed = 0, next = 0;
async function worker() {
  while (next < todo.length) {
    const it = todo[next++];
    try {
      const t = JSON.parse(fs.readFileSync(path.join("public/topics", `${it.s}.json`), "utf8"));
      const existing = fs.existsSync(path.join(DIR, `${it.s}.json`)) ? JSON.parse(fs.readFileSync(path.join(DIR, `${it.s}.json`), "utf8")) : {};
      let page = null;
      for (let attempt = 0; attempt < 5 && !page; attempt++) {
        try { page = (await generateReviewedTopicPage({ name: t.n, category: t.c, context: contextOf(t, existing) }, { env })).page; } catch (e) { await new Promise((r) => setTimeout(r, 8000 * (attempt + 1))); }
      }
      if (!page) { failed++; console.log("failed", t.n); continue; }
      if (!page.medical) { skipped++; console.log("not medical", t.n); continue; }
      fs.writeFileSync(path.join(DIR, `${it.s}.json`), JSON.stringify({ ...page, reviewed: false }, null, 1) + "\n");
      done++;
      if (done % 10 === 0) console.log(`done ${done}/${todo.length} (skipped ${skipped}, failed ${failed})`);
    } catch (e) { failed++; console.log("error", it.s, e.message); }
  }
}
await Promise.all(Array.from({ length: PAR }, worker));
console.log(`finished: ${done} written, ${skipped} not medical, ${failed} failed`);
if (failed) process.exitCode = 1;
