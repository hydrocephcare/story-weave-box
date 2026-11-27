import { loadPublishedTopicPages } from "./corpus.mjs";
import { maintenanceRequest } from "./maintenance-client.mjs";
import { generateReviewedTopicPage } from "../../supabase/functions/_shared/topicAi.js";

const COUNT = Math.max(1, Math.min(40, Number(process.env.TOPIC_REVIEW_COUNT || process.argv[2] || 40)));
const PARALLEL = Math.max(1, Math.min(3, Number(process.env.TOPIC_REVIEW_PARALLEL || 2)));
const GROQ = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
const GEMINI = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
if (!GROQ.trim() || !GEMINI.trim()) throw new Error("Both GROQ_API_KEYS (writer) and GEMINI_API_KEYS (reviewer) are required.");

const ready = (p) => Boolean(p?.aiReview?.status === "passed") && String(p?.summary || "").length >= 100
  && (p?.sections?.length || 0) >= 9 && (p?.exam?.length || 0) >= 8 && (p?.faq?.length || 0) >= 3
  && JSON.stringify(p).split(/\s+/).length >= 700;

const rows = await loadPublishedTopicPages();
const queue = rows.filter((row) => row.ai_review_status !== "passed" || !ready(row.content)).slice(0, COUNT);
console.log("Published topic pages: " + rows.length + "; reviewing " + queue.length + " legacy pages.");

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
      const page = {
        ...result.page,
        aiReview: { ...(result.page.aiReview || {}), status: "passed", model: result.review.model, rounds: result.review.rounds || 0 },
      };
      const saved = await maintenanceRequest("review-save", {
        slug: row.slug, updatedAt: row.updated_at, page,
        reviewModel: result.review.model, reviewRounds: result.review.rounds || 0,
      });
      if (saved.status !== "reviewed") throw new Error(saved.status || "database update conflict");
      passed++; console.log("reviewed and upgraded: " + row.name);
    } catch (error) {
      failed++; console.error("held for retry: " + row.name + ": " + String(error?.message || error).slice(0, 180));
    }
  }
}
await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
console.log("Neon topic review: " + passed + " passed; " + failed + " held; " + (rows.length - passed) + " remain pending.");
if (failed) process.exitCode = 1;
