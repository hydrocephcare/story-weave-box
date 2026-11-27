import { neon } from "@neondatabase/serverless";
import { generateReviewedTopicPage } from "../../supabase/functions/_shared/topicAi.js";

const DATABASE_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "";
if (!DATABASE_URL) throw new Error("NEON_DATABASE_URL (or DATABASE_URL) is required; refusing to contact the retired Supabase project.");
const db = neon(DATABASE_URL);
const GROQ = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
const GEMINI = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
const COUNT = Math.max(1, Math.min(40, Number(process.env.TOPIC_REVIEW_COUNT || process.argv[2] || 40)));
const PARALLEL = Math.max(1, Math.min(3, Number(process.env.TOPIC_REVIEW_PARALLEL || 2)));
if (!GROQ.trim() || !GEMINI.trim()) throw new Error("Both GROQ_API_KEYS (writer) and GEMINI_API_KEYS (reviewer) are required.");

const rows = await db`SELECT slug,name,category,content,updated_at,ai_review_status
  FROM public.topic_pages WHERE status='published' ORDER BY updated_at ASC LIMIT 2000`;
const ready = (p) => Boolean(p?.aiReview?.status === "passed") && String(p?.summary || "").length >= 100
  && (p?.sections?.length || 0) >= 9 && (p?.exam?.length || 0) >= 8 && (p?.faq?.length || 0) >= 3
  && JSON.stringify(p).split(/\s+/).length >= 700;
const queue = rows.filter((row) => row.ai_review_status !== "passed" || !ready(row.content)).slice(0, COUNT);
console.log("Published topic pages: " + rows.length + "; processing " + queue.length + " for independent review.");

let next = 0, passed = 0, failed = 0;
async function worker() {
  while (true) {
    const i = next++; if (i >= queue.length) return;
    const row = queue[i];
    try {
      const prior = row.content || {};
      const context = JSON.stringify({ priorSummary: prior.summary, priorSections: prior.sections, priorExam: prior.exam }).slice(0, 5000);
      const result = await generateReviewedTopicPage({
        name: row.name, category: row.category || "Medicine", context,
        choices: { level: "year4", setting: "tropical", depth: "full", angles: [] },
      }, { env: { GROQ_API_KEYS: GROQ, GEMINI_API_KEYS: GEMINI }, maxFixRounds: 1, timeoutMs: 55000 });
      if (!result.page?.medical || result.review?.status !== "passed") throw new Error("Gemini review did not pass.");
      const page = result.page, reviewedAt = new Date().toISOString();
      const saved = await db`UPDATE public.topic_pages SET
        content = ${JSON.stringify(page)}::jsonb, model = ${page.model || "groq"},
        reviewed = false, updated_at = ${reviewedAt},
        generator_model = ${page.model || "groq"}, ai_review_status = 'passed',
        ai_review_model = ${result.review.model}, ai_reviewed_at = ${reviewedAt},
        ai_review_fix_rounds = ${result.review.rounds || 0}
        WHERE slug = ${row.slug} AND status = 'published' AND updated_at = ${row.updated_at}
        RETURNING slug`;
      if (!saved.length) throw new Error("Page changed during review; queued for a later retry.");
      passed++; console.log("reviewed and upgraded: " + row.name);
    } catch (error) {
      failed++; console.error("held for retry: " + row.name + ": " + String(error?.message || error).slice(0, 180));
    }
  }
}
await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
console.log("Neon topic review: " + passed + " passed; " + failed + " held; " + (rows.length - passed) + " remain pending.");
if (failed) process.exitCode = 1;
