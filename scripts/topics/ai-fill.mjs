// Writes an AI overview for topics that do not have one yet, a few each day. Run by .github/workflows/topics-daily.yml.
//
//   ANTHROPIC_API_KEY=... node scripts/topics/ai-fill.mjs [--dry]      --dry prints the first prompt and calls nothing
//
// Safety rules baked in:
//   * The model only gets what this site already says about the topic and is told to add nothing it is not sure of.
//   * Anything that looks like a drug dose is dropped.
//   * Every overview is saved with reviewed: false, and the page says plainly that it is AI-written and not yet reviewed.
//     Change "reviewed" to true in src/data/topicAi/<slug>.json once a doctor has checked it.
import fs from "fs";
import path from "path";

const DIR = "src/data/topicAi";
const PER_RUN = Number(process.env.AI_TOPICS_PER_RUN || 5);
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const dry = process.argv.includes("--dry");
const key = process.env.ANTHROPIC_API_KEY;
if (!dry && !key) { console.log("No ANTHROPIC_API_KEY set: nothing to do."); process.exit(0); }
if (!fs.existsSync("public/topics/index.json")) { console.error("Run scripts/topics/build-topics.mjs first."); process.exit(1); }
fs.mkdirSync(DIR, { recursive: true });

const index = JSON.parse(fs.readFileSync("public/topics/index.json", "utf8"));
// the most-used topics without an overview come first; topics with practice questions or images are worth more to a student
const todo = index.filter((t) => !fs.existsSync(path.join(DIR, `${t.s}.json`))).sort((a, b) => (b.d + b.q * 2 + b.i) - (a.d + a.q * 2 + a.i)).slice(0, PER_RUN);
console.log(`${todo.length} topic(s) to write today.`);

const DOSE = /\b\d+(\.\d+)?\s?(mg|mcg|µg|ug|g|ml|mL|iu|IU|units?)\b(\/|\s?per\s)?/;
const arr = (a, max) => (Array.isArray(a) ? a.map(String).map((s) => s.trim()).filter((s) => s.length >= 12 && s.length <= 240 && !DOSE.test(s)).slice(0, max) : []);

function promptFor(t) {
  const facts = [
    t.lead && `- ${t.lead.t}`,
    ...(t.sec ?? []).flatMap((s) => [`- Section "${s.h}" (${s.s}):`, ...s.b.map((b) => `  - ${b}`)]),
    ...t.snip.slice(0, 8).map((s) => `- ${s.t}`),
    ...t.qs.filter((q) => q.e).slice(0, 3).map((q) => `- Exam point: ${q.q} Answer: ${q.o[q.a]}. ${q.e}`),
  ].filter(Boolean).join("\n");
  return `You are writing a short, accurate overview of "${t.n}" for medical students (subject: ${t.c}).

Below is what the Ompath Study library already says about it. Use it as your main source. You may add standard, widely accepted textbook knowledge, but ONLY if you are sure. If you are not sure, leave it out. Never invent statistics, guidelines or drug doses, and do not give any doses.

${facts || "(The library has little text on this topic: write only what is standard and certain.)"}

Reply with ONLY a JSON object, no other text:
{"overview": "2-3 sentences, plain words, under 90 words", "keyPoints": ["4 to 6 short facts a student must know"], "pearls": ["2 to 3 clinical pearls"], "examTraps": ["2 to 3 common mistakes students make in exams"]}`;
}

async function ask(prompt) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 900, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const text = (j.content ?? []).map((c) => c.text ?? "").join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON in reply");
  return JSON.parse(m[0]);
}

let written = 0;
for (const it of todo) {
  const t = JSON.parse(fs.readFileSync(path.join("public/topics", `${it.s}.json`), "utf8"));
  const prompt = promptFor(t);
  if (dry) { console.log(`--- ${t.n}\n${prompt}\n`); break; }
  try {
    const out = await ask(prompt);
    const overview = String(out.overview || "").trim();
    if (overview.length < 40 || overview.length > 700 || DOSE.test(overview)) { console.log(`skip ${t.n}: overview not acceptable`); continue; }
    const body = { overview, keyPoints: arr(out.keyPoints, 6), pearls: arr(out.pearls, 3), examTraps: arr(out.examTraps, 3), generatedAt: new Date().toISOString().slice(0, 10), model: MODEL, reviewed: false };
    if (body.keyPoints.length < 3) { console.log(`skip ${t.n}: too few key points`); continue; }
    fs.writeFileSync(path.join(DIR, `${t.s}.json`), JSON.stringify(body, null, 2) + "\n");
    written++;
    console.log(`wrote ${t.n}`);
  } catch (e) {
    console.log(`failed ${t.n}: ${e.message}`);
  }
}
console.log(`${written} overview(s) written.`);
