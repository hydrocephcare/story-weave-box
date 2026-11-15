import { runTopicReviewBatch } from "../_shared/topicReview.js";

const cors = { "Access-Control-Allow-Origin": "https://www.ompathstudy.com", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-review-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });
  const env = Deno.env.toObject();
  const bearer = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const supplied = req.headers.get("x-review-secret") || bearer;
  const expected = env.TOPIC_REVIEW_CRON_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!expected || supplied !== expected) return new Response(JSON.stringify({ error: "unauthorised" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const result = await runTopicReviewBatch(env, { limit: 5 });
    return new Response(JSON.stringify(result), { status: 200, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error?.message || error).slice(0, 240) }), { status: 500, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
});
