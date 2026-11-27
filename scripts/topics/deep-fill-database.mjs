import { neon } from "@neondatabase/serverless";
import { generateCheckedDeep } from "../../supabase/functions/_shared/contentCheck.js";

const DATABASE_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "";
if (!DATABASE_URL) throw new Error("NEON_DATABASE_URL (or DATABASE_URL) is required; refusing to contact the retired Supabase project.");
const db = neon(DATABASE_URL);
const GROQ = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
const GEMINI = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
const COUNT = Math.max(1, Math.min(40, Number(process.env.TOPIC_DEEP_DB_COUNT || process.argv[2] || 40)));
const PARALLEL = Math.max(1, Math.min(3, Number(process.env.TOPIC_DEEP_DB_PARALLEL || 2)));
if (!GROQ.trim() || !GEMINI.trim()) throw new Error("Both GROQ_API_KEYS (writer) and GEMINI_API_KEYS (reviewer) are required.");

const rows = await db`SELECT slug,name,category,content,updated_at
  FROM public.topic_pages WHERE status='published' ORDER BY updated_at ASC LIMIT 2000`;
const ready = (deep) => Boolean(deep?.checked) && (deep?.sections?.length || 0) >= 7
  && (deep?.vivas?.length || 0) >= 12 && (deep?.mcqs?.length || 0) >= 6
  && (deep?.cases?.length || 0) >= 2 && (deep?.facts?.length || 0) >= 6
  && (deep?.mistakes?.length || 0) >= 5 && (deep?.exam?.length || 0) >= 12;
const queue = rows.filter((row) => !ready(row.content?.deep)).slice(0, COUNT);
console.log("Published topics: " + rows.length + "; complete deep notes: " + (rows.length - rows.filter((row) => !ready(row.content?.deep)).length) + "; processing " + queue.length + ".");

let next = 0, savedCount = 0, failed = 0;
async function worker() {
  while (true) {
    const i = next++; if (i >= queue.length) return;
    const row = queue[i];
    try {
      const deep = await generateCheckedDeep({
        name: row.name, category: row.category || "Medicine", base: row.content || {}, past: [],
      }, { GROQ_API_KEYS: GROQ, GEMINI_API_KEYS: GEMINI }, fetch, 240000);
      const content = { ...(row.content || {}), deep };
      const saved = await db`UPDATE public.topic_pages SET content = ${JSON.stringify(content)}::jsonb,
        updated_at = now() WHERE slug = ${row.slug} AND status = 'published'
        AND updated_at = ${row.updated_at} RETURNING slug`;
      if (!saved.length) throw new Error("Page changed during deep-note generation; queued for a later retry.");
      savedCount++; console.log("deep notes saved and Gemini-checked: " + row.name);
    } catch (error) {
      failed++; console.error("left in queue for retry: " + row.name + ": " + String(error?.message || error).slice(0, 180));
    }
  }
}
await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
console.log("Neon deep-note queue: " + savedCount + " saved; " + failed + " held; " + (rows.length - savedCount) + " still pending.");
if (failed) process.exitCode = 1;
