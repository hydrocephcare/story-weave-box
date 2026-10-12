// Writes a full page for topics that do not have one yet, a few each day (the same writer the site uses when a reader opens a thin topic).
// Run by .github/workflows/topics-daily.yml. Pages are saved in src/data/topicAi/<slug>.json and shown on the topic page.
//
//   GEMINI_API_KEY=... node scripts/topics/ai-fill.mjs [--dry]      --dry prints the first prompt and calls nothing
//
// Safety: the model is given only what the site already says and told to leave out anything it is not sure of; anything that looks like a
// drug dose is removed (supabase/functions/_shared/topicAi.js); every page is saved with reviewed: false and the page says so. Set "reviewed": true in the
// file once a doctor has checked it.
import fs from "fs";
import path from "path";
import { buildPrompt, generateTopicPage } from "../../supabase/functions/_shared/topicAi.js";

const DIR = "src/data/topicAi";
const PER_RUN = Number(process.env.AI_TOPICS_PER_RUN || 5);
const dry = process.argv.includes("--dry");
const env = { GEMINI_API_KEY: process.env.GEMINI_API_KEY, LOVABLE_API_KEY: process.env.LOVABLE_API_KEY, OMNIROUTE_BASE_URL: process.env.OMNIROUTE_BASE_URL, OMNIROUTE_API_KEY: process.env.OMNIROUTE_API_KEY };
if (!dry && !env.GEMINI_API_KEY && !env.LOVABLE_API_KEY && !env.OMNIROUTE_API_KEY) { console.log("No GEMINI_API_KEY set: nothing to do."); process.exit(0); }
if (!fs.existsSync("public/topics/index.json")) { console.error("Run scripts/topics/build-topics.mjs first."); process.exit(1); }
fs.mkdirSync(DIR, { recursive: true });

const index = JSON.parse(fs.readFileSync("public/topics/index.json", "utf8"));
// the most-used topics without a page come first; topics with practice questions or images are worth more to a student
const todo = index.filter((t) => !fs.existsSync(path.join(DIR, `${t.s}.json`))).sort((a, b) => (b.d + b.q * 2 + b.i) - (a.d + a.q * 2 + a.i)).slice(0, PER_RUN);
console.log(`${todo.length} topic(s) to write today.`);

const contextOf = (t) => [t.lead?.t, ...(t.sec ?? []).flatMap((s) => [s.h, ...s.b]), ...t.snip.map((s) => s.t), ...t.qs.filter((q) => q.e).slice(0, 3).map((q) => `${q.q} ${q.o[q.a]}. ${q.e}`)].filter(Boolean).join("\n");

let written = 0;
for (const it of todo) {
  const t = JSON.parse(fs.readFileSync(path.join("public/topics", `${it.s}.json`), "utf8"));
  if (dry) { console.log(`--- ${t.n}\n${buildPrompt({ name: t.n, category: t.c, context: contextOf(t) })}\n`); break; }
  try {
    const page = await generateTopicPage({ name: t.n, category: t.c, context: contextOf(t), env });
    if (!page.medical) { console.log(`skip ${t.n}: the model says it is not a medical topic`); continue; }
    fs.writeFileSync(path.join(DIR, `${t.s}.json`), JSON.stringify({ ...page, reviewed: false }, null, 2) + "\n");
    written++;
    console.log(`wrote ${t.n}`);
  } catch (e) {
    console.log(`failed ${t.n}: ${e.message}`);
  }
}
console.log(`${written} page(s) written.`);
