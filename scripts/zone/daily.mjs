// Daily Friend Zone games generated and independently checked by the Neon/Cloudflare AI backend.
// No Supabase REST access or GitHub-held model keys are used by this workflow.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { maintenanceRequest } from "../topics/maintenance-client.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "public/data/zone-daily.json");
const today = new Date().toISOString().slice(0, 10);
const seed = [...today].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
let state = seed;
const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
const shuffle = (items) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const { topics = [] } = await maintenanceRequest("zone-topics");
const pool = shuffle(topics);
if (pool.length < 6) throw new Error("Not enough published MCQ topics in Neon to generate today's games.");

const plan = [["quiz", 1], ["quiz", 3], ["case", 4], ["case", 5], ["drug", 3], ["drug", 4]];
const labels = { quiz: "Quiz", case: "Case Showdown", drug: "Drug Duel" };
const games = [];

for (const [kind, targetYear] of plan) {
  const topic = pool.find((item) => item.year >= targetYear - 1 && item.year <= targetYear + 1
    && !games.some((game) => game.topic.toLowerCase() === item.name.toLowerCase()))
    || pool.find((item) => !games.some((game) => game.topic.toLowerCase() === item.name.toLowerCase()));
  if (!topic) continue;

  console.log(`${labels[kind]}: ${topic.name} (Year ${topic.year})`);
  const result = await maintenanceRequest("zone-write", { kind, topic });
  if (!result.validated || !Array.isArray(result.questions) || result.questions.length < 5) {
    console.warn("  independent medical review did not pass; game skipped");
    continue;
  }
  games.push({
    id: `${today}-${games.length + 1}`,
    title: kind === "quiz" ? `${topic.name}: quick quiz` : kind === "case" ? `${topic.name}: case showdown` : `${topic.name}: drug duel`,
    game: kind,
    topic: topic.name,
    year: topic.year,
    blurb: `${labels[kind]} for Year ${topic.year} and above, reviewed before release.`,
    questions: result.questions,
  });
}

if (games.length < 4) throw new Error("Fewer than four medically validated games were produced; yesterday's file has been preserved.");
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ date: today, games }, null, 1) + "\n");
console.log(`Wrote ${games.length} validated games to public/data/zone-daily.json`);
