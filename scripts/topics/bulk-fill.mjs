// Writes topic pages ahead of time with Gemini, so readers and search engines find the text already there.
// Keys: GEMINI_API_KEYS (comma separated) or one key per line in .gemini-keys.local (never committed). They are used in turn.
// Pages go to src/data/topicAi/<slug>.json and are folded into the static pages by build-topics.mjs.
//   node scripts/topics/bulk-fill.mjs [count] [--parallel=4]
import fs from "node:fs";
import path from "node:path";
import { generateTopicPage } from "../../supabase/functions/_shared/topicAi.js";

const DIR = "src/data/topicAi";
const COUNT = Number(process.argv.find((a) => /^\d+$/.test(a)) || 1000);
const PAR = Number((process.argv.find((a) => a.startsWith("--parallel=")) || "--parallel=4").split("=")[1]);
const local = fs.existsSync(".gemini-keys.local") ? fs.readFileSync(".gemini-keys.local", "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(",") : "";
const env = { GEMINI_API_KEYS: [process.env.GEMINI_API_KEYS, local].filter(Boolean).join(",") };
if (!env.GEMINI_API_KEYS) { console.log("No Gemini keys: set GEMINI_API_KEYS or fill .gemini-keys.local"); process.exit(0); }
fs.mkdirSync(DIR, { recursive: true });

const index = JSON.parse(fs.readFileSync("public/topics/index.json", "utf8"));
const todo = index.filter((t) => !fs.existsSync(path.join(DIR, `${t.s}.json`)) && !t.ai).sort((a, b) => (b.d + b.q * 2 + b.i) - (a.d + a.q * 2 + a.i)).slice(0, COUNT);
console.log(`${todo.length} topics to write, ${PAR} at a time`);
const contextOf = (t) => [t.lead?.t, ...(t.sec ?? []).flatMap((s) => [s.h, ...s.b]), ...(t.snip ?? []).map((s) => s.t)].filter(Boolean).join("\n").slice(0, 3000);

let done = 0, skipped = 0, failed = 0, next = 0;
async function worker() {
  while (next < todo.length) {
    const it = todo[next++];
    try {
      const t = JSON.parse(fs.readFileSync(path.join("public/topics", `${it.s}.json`), "utf8"));
      let page = null;
      for (let attempt = 0; attempt < 5 && !page; attempt++) {
        try { page = await generateTopicPage({ name: t.n, category: t.c, context: contextOf(t), env }); } catch (e) { await new Promise((r) => setTimeout(r, 8000 * (attempt + 1))); }
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
