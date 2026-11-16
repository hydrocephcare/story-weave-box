import { generateReviewedTopicPage } from "../../supabase/functions/_shared/topicAi.js";
const SB = (process.env.SUPABASE_URL || "https://strfwaqvxvkhjbqrwmla.supabase.co").replace(/\/$/, "");
const KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0cmZ3YXF2eHZraGpicXJ3bWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MTIwNzEsImV4cCI6MjEwODI4ODA3MX0.F_bGNSKsC6Wbriit19-OIwNdScqAUU0yhJ3TtQuiTkE";
const WRITE = process.env.POLISH_WRITE_KEY || "";
const GROQ = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
const GEMINI = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
const COUNT = Math.max(1, Math.min(40, Number(process.env.TOPIC_REVIEW_COUNT || process.argv[2] || 40)));
const PARALLEL = Math.max(1, Math.min(3, Number(process.env.TOPIC_REVIEW_PARALLEL || 2)));
if (!KEY || !WRITE) throw new Error("SUPABASE_ANON_KEY and POLISH_WRITE_KEY are required for secure topic updates.");
if (!GROQ.trim() || !GEMINI.trim()) throw new Error("Both GROQ_API_KEYS (writer) and GEMINI_API_KEYS (reviewer) are required.");
const headers = { apikey: KEY, Authorization: "Bearer " + KEY, "x-polish-key": WRITE, "content-type": "application/json" };
async function request(path, options = {}) {
  const r = await fetch(SB + "/rest/v1/" + path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const body = await r.text(); let json = null; try { json = body ? JSON.parse(body) : null; } catch {}
  if (!r.ok) throw new Error("Supabase " + r.status + ": " + body.slice(0, 350));
  return json;
}
const rows = await request("topic_pages?select=slug,name,category,content,updated_at,ai_review_status&status=eq.published&order=updated_at.asc&limit=1000");
const ready = (p) => Boolean(p?.aiReview?.status === "passed") && String(p?.summary || "").length >= 100 && (p?.sections?.length || 0) >= 9 && (p?.exam?.length || 0) >= 8 && (p?.faq?.length || 0) >= 3 && JSON.stringify(p).split(/\s+/).length >= 700;
const queue = (Array.isArray(rows) ? rows : []).filter((r) => r.ai_review_status !== "passed" || !ready(r.content)).slice(0, COUNT);
console.log("Published topic pages needing a comprehensive Groq rewrite and Gemini review: " + rows.length + "; processing " + queue.length + ".");
let next = 0, passed = 0, failed = 0;
const worker = async () => {
  while (true) {
    const i = next++; if (i >= queue.length) return;
    const row = queue[i];
    try {
      const prior = row.content || {};
      const context = JSON.stringify({ priorSummary: prior.summary, priorSections: prior.sections, priorExam: prior.exam }).slice(0, 5000);
      const result = await generateReviewedTopicPage({ name: row.name, category: row.category || "Medicine", context,
        choices: { level: "year4", setting: "tropical", depth: "full", angles: [] } },
        { env: { GROQ_API_KEYS: GROQ, GEMINI_API_KEYS: GEMINI }, maxFixRounds: 1, timeoutMs: 55000 });
      if (!result.page?.medical || result.review?.status !== "passed") throw new Error("Gemini review did not pass.");
      const page = result.page, reviewedAt = new Date().toISOString();
      const saved = await request("topic_pages?slug=eq." + encodeURIComponent(row.slug) + "&status=eq.published", {
        method: "PATCH", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ content: page, model: page.model || "groq", reviewed: false, updated_at: reviewedAt,
          generator_model: page.model || "groq", ai_review_status: "passed", ai_review_model: result.review.model,
          ai_reviewed_at: reviewedAt, ai_review_fix_rounds: result.review.rounds || 0 }),
      });
      if (!Array.isArray(saved) || !saved.length) throw new Error("Page changed while being reviewed; retry will pick up the current version.");
      passed++; console.log("reviewed and upgraded: " + row.name);
    } catch (e) { failed++; console.error("held for retry: " + row.name + ": " + String(e?.message || e).slice(0, 180)); }
  }
};
await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
console.log("Legacy topic review: " + passed + " passed; " + failed + " held; " + Math.max(0, rows.length - passed) + " still pending.");
if (failed) process.exitCode = 1;
