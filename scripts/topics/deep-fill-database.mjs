import { loadPublishedTopicPages } from "./corpus.mjs";
import { maintenanceRequest } from "./maintenance-client.mjs";
import { generateCheckedDeep } from "../../supabase/functions/_shared/contentCheck.js";

const COUNT = Math.max(1, Math.min(40, Number(process.env.TOPIC_DEEP_DB_COUNT || process.argv[2] || 40)));
const PARALLEL = Math.max(1, Math.min(3, Number(process.env.TOPIC_DEEP_DB_PARALLEL || 2)));
const GROQ = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
const GEMINI = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
if (!GROQ.trim() || !GEMINI.trim()) throw new Error("Both GROQ_API_KEYS (writer) and GEMINI_API_KEYS (reviewer) are required.");

const ready = (deep) => Boolean(deep?.checked) && (deep?.sections?.length || 0) >= 7
  && (deep?.vivas?.length || 0) >= 12 && (deep?.mcqs?.length || 0) >= 6
  && (deep?.cases?.length || 0) >= 2 && (deep?.facts?.length || 0) >= 6
  && (deep?.mistakes?.length || 0) >= 5 && (deep?.exam?.length || 0) >= 12;

const rows = await loadPublishedTopicPages();
const queue = rows.filter((row) => !ready(row.content?.deep)).slice(0, COUNT);
console.log("Published topics: " + rows.length + "; generating deep exam notes for " + queue.length + ".");

let next = 0, savedCount = 0, failed = 0;
async function worker() {
  while (true) {
    const i = next++; if (i >= queue.length) return;
    const row = queue[i];
    try {
      const deep = await generateCheckedDeep(
        { name: row.name, category: row.category || "Medicine", base: row.content || {}, past: [] },
        { GROQ_API_KEYS: GROQ, GEMINI_API_KEYS: GEMINI },
        fetch,
        240000,
      );
      const result = await maintenanceRequest("deep-save", { slug: row.slug, updatedAt: row.updated_at, deep });
      if (result.status !== "deep_saved" && result.status !== "existing") throw new Error(result.status || "database update conflict");
      savedCount++; console.log("deep notes saved and Gemini-checked: " + row.name);
    } catch (error) {
      failed++; console.error("left in queue for retry: " + row.name + ": " + String(error?.message || error).slice(0, 180));
    }
  }
}
await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
console.log("Neon deep-note queue: " + savedCount + " saved; " + failed + " held; " + (rows.length - savedCount) + " still pending.");
if (failed) process.exitCode = 1;
