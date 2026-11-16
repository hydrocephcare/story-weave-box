// Merge committed Groq/Gemini topic pages into the static topic corpus without querying Supabase.
// This runs during Vercel builds, where the daily GitHub workflow has already committed the corpus.
import fs from "node:fs";
import path from "node:path";

const DIR = "public/topics";
const AI_DIR = "src/data/topicAi";
const indexFile = path.join(DIR, "index.json");
if (!fs.existsSync(indexFile)) throw new Error("The committed public/topics/index.json is missing.");
const index = JSON.parse(fs.readFileSync(indexFile, "utf8"));
const ready = (p) => Boolean(p?.medical !== false && p?.aiReview?.status === "passed" && String(p?.summary || "").length >= 100 &&
  (p?.sections?.length || 0) >= 9 && (p?.exam?.length || 0) >= 8 && (p?.faq?.length || 0) >= 3 && JSON.stringify(p).split(/\s+/).length >= 700);
let merged = 0, indexable = 0;
for (const item of index) {
  const file = path.join(DIR, item.s + ".json");
  if (!fs.existsSync(file)) continue;
  const page = JSON.parse(fs.readFileSync(file, "utf8"));
  const aiFile = path.join(AI_DIR, item.s + ".json");
  const local = fs.existsSync(aiFile) ? JSON.parse(fs.readFileSync(aiFile, "utf8")) : null;
  const candidates = [local, page.ai].filter(Boolean).sort((a, b) => Number(ready(b)) - Number(ready(a)) || JSON.stringify(b).length - JSON.stringify(a).length);
  if (candidates.length) page.ai = candidates[0]; else delete page.ai;
  const ok = ready(page.ai);
  item.ai = ok ? 1 : 0;
  if (ok) indexable++;
  if (local && page.ai === local) merged++;
  fs.writeFileSync(file, JSON.stringify(page));
}
fs.writeFileSync(indexFile, JSON.stringify(index));
console.log("Merged " + merged + " local AI topic pages; " + indexable + " meet the verified comprehensive indexing standard.");
