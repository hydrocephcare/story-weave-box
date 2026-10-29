// New Friend Zone games every day, written by the AI from the site's own topics: quizzes, clinical cases and drug duels, each for one study year.
// Runs every morning (.github/workflows/zone-daily.yml) and by hand:  node scripts/zone/daily.mjs
// Needs GROQ_API_KEYS and/or GEMINI_API_KEYS. The result is public/data/zone-daily.json, which the Friend Zone page shows under "New today".
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { askJson } from "../../api/_lib/llm.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "public/data/zone-daily.json");
const env = (n) => { if (process.env[n]) return process.env[n]; try { return fs.readFileSync(path.join(ROOT, ".env"), "utf8").match(new RegExp(`^${n}\s*=\s*"?([^"\r\n]+)"?`, "m"))?.[1] ?? ""; } catch { return ""; } };
const URL_ = env("VITE_SUPABASE_URL") || "https://strfwaqvxvkhjbqrwmla.supabase.co";
const KEY = env("VITE_SUPABASE_PUBLISHABLE_KEY") || env("VITE_SUPABASE_ANON_KEY");
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
  const ask = `${PROMPT[kind](t)} Reply with ONLY a JSON object: {"questions":[{"q":"question","options":["A","B","C","D"],"correct":0,"explanation":"one sentence"}]}. Four options, one clearly best answer, no "all of the above", correct is the index of the right option. Use standard medical terminology and facts you are certain of.`;
  const r = await askJson([{ role: "system", content: "You write accurate exam questions for medical students. You reply with JSON only." }, { role: "user", content: ask }], { maxTokens: 5000, temperature: 0.4, prefer: "gemini" });
  if (r.error) { console.warn("  AI:", r.error); return []; }
  try {
    const arr = JSON.parse(r.text.slice(r.text.indexOf("{"), r.text.lastIndexOf("}") + 1)).questions ?? [];
    return arr.filter((x) => x?.q && Array.isArray(x.options) && x.options.length >= 3 && x.options.length <= 6 && Number.isInteger(x.correct) && x.correct >= 0 && x.correct < x.options.length && new Set(x.options.map(String)).size === x.options.length)
      .map((x) => ({ q: String(x.q).slice(0, 700), options: x.options.map((o) => String(o).slice(0, 200)), correct: x.correct, explanation: String(x.explanation || "").slice(0, 400), ai: true, kind: kind === "case" ? "case" : kind === "drug" ? "drug" : "mcq" }));
  } catch { return []; }
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
  if (questions.length < 5) { console.warn("  too few valid questions, skipped"); continue; }
  games.push({ id: `${today}-${games.length + 1}`, title: kind === "quiz" ? `${t.name}: quick quiz` : kind === "case" ? `${t.name}: case showdown` : `${t.name}: drug duel`, game: kind, topic: t.name, year: t.year, blurb: `${LABEL[kind]} for Year ${t.year} and above, written fresh today.`, questions });
}
if (games.length < 2) { console.error("The AI wrote too few games today; keeping yesterday's file."); process.exit(0); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ date: today, games }, null, 1) + "\n");
console.log(`Wrote ${games.length} games to public/data/zone-daily.json`);
