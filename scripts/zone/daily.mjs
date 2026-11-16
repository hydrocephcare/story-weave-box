// New Friend Zone games every day, written by the AI from the site's own topics: quizzes, clinical cases and drug duels, each for one study year.
// Runs every morning (.github/workflows/zone-daily.yml) and by hand:  node scripts/zone/daily.mjs
// Needs GROQ_API_KEYS and/or GEMINI_API_KEYS. The result is public/data/zone-daily.json, which the Friend Zone page shows under "New today".
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { askModel } from "../../supabase/functions/_shared/topicAi.js";
import { checkContent } from "../../supabase/functions/_shared/contentCheck.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "public/data/zone-daily.json");
const URL_ = process.env.VITE_SUPABASE_URL || "https://strfwaqvxvkhjbqrwmla.supabase.co";
const KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0cmZ3YXF2eHZraGpicXJ3bWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MTIwNzEsImV4cCI6MjEwODI4ODA3MX0.F_bGNSKsC6Wbriit19-OIwNdScqAUU0yhJ3TtQuiTkE";
const GROQ = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
const GEMINI = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
if (!KEY || !GROQ || !GEMINI) throw new Error("Supabase public key, GROQ_API_KEYS and GEMINI_API_KEYS are required.");
const today = new Date().toISOString().slice(0, 10);
const seed = [...today].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
let s = seed; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// topics: the titles of the site's published MCQ sets, with their year
async function topics() {
  const r = await fetch(`${URL_}/rest/v1/mcq_sets?select=title,category&published=eq.true&deleted_at=is.null&limit=1000`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  const seen = new Set();
  return (await r.json()).map((x) => {
    const y = /^Year\s*(\d)/i.exec(x.category || "")?.[1];
    const name = String(x.title || "").replace(/\b(MCQs?|questions?|quiz|set|part)\b.*$/i, "").replace(/[–—:|-]\s*$/, "").replace(/\s+/g, " ").trim();
    return { year: y ? Number(y) : 0, name, unit: String(x.category || "").replace(/^Year\s*\d\s*:\s*/i, "") };
  }).filter((t) => t.year && t.name.length > 3 && t.name.length < 60 && !seen.has(t.name.toLowerCase()) && seen.add(t.name.toLowerCase()));
}

const PROMPT = {
  quiz: (t) => `Write 10 multiple-choice questions on "${t.name}" (${t.unit}) for a Year ${t.year} MBChB student.`,
  case: (t) => `Write 8 short clinical case questions on "${t.name}" (${t.unit}) for a Year ${t.year} MBChB student. Each has a 2-3 sentence patient vignette (age, sex, presentation, one or two key findings) and asks for the most likely diagnosis or the next best step.`,
  drug: (t) => `Write 8 drug questions related to "${t.name}" (${t.unit}) for a Year ${t.year} MBChB student: the class, mechanism, main indication or the characteristic side effect of a named drug.`,
};
const LABEL = { quiz: "Quiz", case: "Case Showdown", drug: "Drug Duel" };

async function write(kind, t) {
  const prompt = PROMPT[kind](t) + " Reply with ONLY a JSON object: {\"questions\":[{\"q\":\"question\",\"options\":[\"A\",\"B\",\"C\",\"D\"],\"correct\":0,\"explanation\":\"one sentence\"}]}. Four options, one clearly best answer, no all-of-the-above, correct is the index of the right option. Use standard medical terminology and facts you are certain of.";
  const parse = (raw) => {
    try {
      const text = String(raw || "");
      const obj = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      return (obj.questions || []).filter((x) => x && x.q && Array.isArray(x.options) && x.options.length >= 3 && x.options.length <= 6 && Number.isInteger(x.correct) && x.correct >= 0 && x.correct < x.options.length && new Set(x.options.map(String)).size === x.options.length)
        .map((x) => ({ q: String(x.q).slice(0, 700), options: x.options.map((o) => String(o).slice(0, 200)), correct: x.correct, explanation: String(x.explanation || "").slice(0, 400), ai: true, kind: kind === "case" ? "case" : kind === "drug" ? "drug" : "mcq" }));
    } catch { return []; }
  };
  const draft = await askModel(prompt, { env: { GROQ_API_KEYS: GROQ }, plain: true, timeoutMs: 45000, maxTokens: 5000 });
  let questions = parse(draft.text);
  if (questions.length < 5) { console.warn("  Groq produced too few valid questions"); return null; }
  const review = await checkContent({ title: t.name + " " + LABEL[kind], kind: "medical MCQ, clinical case and pharmacology questions", text: JSON.stringify(questions), env: { GEMINI_API_KEYS: GEMINI } });
  if (review.validated) return { questions, reviewModel: review.model };
  const repairPrompt = "Correct the medical or examination-quality problems listed below in this question set. Preserve the topic and year level. Ensure every question has one best answer, plausible distractors and a clear explanation. Use only standard accepted medical knowledge; do not invent doses, statistics or guidelines. Output ONLY the complete JSON object with a questions array.\nISSUES:\n" +
    (review.issues || []).map((x, i) => (i + 1) + ". " + x.problem + " Fix: " + x.fix).join("\n") + "\nQUESTIONS:\n" + JSON.stringify(questions);
  const fixed = await askModel(repairPrompt, { env: { GROQ_API_KEYS: GROQ }, plain: true, timeoutMs: 45000, maxTokens: 5000 });
  questions = parse(fixed.text);
  if (questions.length < 5) return null;
  const second = await checkContent({ title: t.name + " " + LABEL[kind], kind: "medical MCQ, clinical case and pharmacology questions", text: JSON.stringify(questions), env: { GEMINI_API_KEYS: GEMINI } });
  if (!second.validated) { console.warn("  Gemini did not clear this question set"); return null; }
  return { questions, reviewModel: second.model };
}

const pool = shuffle(await topics());
if (pool.length < 6) { console.error("Not enough topics on the site."); process.exit(1); }
const plan = [["quiz", 1], ["quiz", 3], ["case", 4], ["case", 5], ["drug", 3], ["drug", 4]];
const games = [];
for (const [kind, minYear] of plan) {
  const t = pool.find((x) => x.year >= minYear - 1 && x.year <= minYear + 1 && !games.some((g) => g.topic === x.name)) ?? pool.find((x) => !games.some((g) => g.topic === x.name));
  if (!t) continue;
  console.log(`${LABEL[kind]}: ${t.name} (Year ${t.year})`);
  const questions = await write(kind, t);
  if (!questions || questions.length < 5) { console.warn("  too few valid questions, skipped"); continue; }
  games.push({ id: `${today}-${games.length + 1}`, title: kind === "quiz" ? `${t.name}: quick quiz` : kind === "case" ? `${t.name}: case showdown` : `${t.name}: drug duel`, game: kind, topic: t.name, year: t.year, blurb: `${LABEL[kind]} for Year ${t.year} and above, written fresh today.`, questions });
}
if (games.length < 4) { console.error("The AI wrote fewer than four usable games; keeping yesterday's file."); process.exit(1); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ date: today, games }, null, 1) + "\n");
console.log(`Wrote ${games.length} games to public/data/zone-daily.json`);
