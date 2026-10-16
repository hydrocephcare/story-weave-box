// GET /api/ai?task=sb&u=/rest/v1/articles?select=...  Public read-only Supabase queries for visitors who are not signed in, answered with an edge-cache header,
// so the same list or article is read from the database once every few minutes instead of once per visit. See src/lib/sbCache.ts.
const SB = process.env.SUPABASE_URL || "https://dekyjrfwvavtoivqivno.supabase.co";
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_jOXeiFMWJj1z_M-zShimXA_cG9f2QxL";
const ALLOWED = /^\/rest\/v1\/(articles|mcq_sets|flashcard_sets|stories|article_categories|app_settings|topic_pages|resource_topics|study_resources|academic_years|medical_concepts|medical_concept_aliases|concept_relationships|contests|contest_universities|contest_rounds)\?/;
// things that must stay fresh are kept for a minute only
const SHORT = /^\/rest\/v1\/(contests|contest_universities|contest_rounds|app_settings)\?/;

export default async function handler(req, res) {
  const one = (v) => String(Array.isArray(v) ? v[0] : v ?? "");
  const u = one(req.query?.u);
  if (req.method !== "GET" || !ALLOWED.test(u) || u.length > 3000 || /apikey|authorization/i.test(u)) return res.status(400).json({ error: "not cacheable" });
  const acc = one(req.query?.acc);
  try {
    const r = await fetch(SB + u, { headers: { apikey: KEY, accept: acc || "application/json" } });
    const body = await r.text();
    res.statusCode = r.status;
    res.setHeader("Content-Type", r.headers.get("content-type") || "application/json");
    res.setHeader("Cache-Control", r.status === 200 ? `public, s-maxage=${SHORT.test(u) ? 60 : 300}, stale-while-revalidate=${SHORT.test(u) ? 300 : 3600}` : "no-store");
    return res.end(body);
  } catch {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "upstream unavailable" });
  }
}
