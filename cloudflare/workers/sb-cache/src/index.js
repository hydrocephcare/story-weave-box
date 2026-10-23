// GET /?u=/rest/v1/articles?...&acc=application/json  Public, read-only Supabase queries for visitors who are not signed in.
// The answer is kept in R2. While it is fresh it is served from R2 and Supabase is not touched. When it is old it is fetched again, and if Supabase
// is down or restricted the old copy is served, so the site keeps working. Same list of tables as src/lib/sbCache.ts.
const ALLOWED = /^\/rest\/v1\/(articles|mcq_sets|flashcard_sets|stories|article_categories|app_settings|topic_pages|resource_topics|study_resources|academic_years|medical_concepts|medical_concept_aliases|concept_relationships|contests|contest_universities|contest_rounds|rpc\/exam_catalog)(\?|$)/;
const SHORT = /^\/rest\/v1\/(contests|contest_universities|contest_rounds|app_settings)(\?|$)/; // settings that change: 1 minute
const ONE = /[?&](id|slug)=eq\./;                                                                  // one article or set: 3 hours
const ttl = (p) => (SHORT.test(p) ? 60 : ONE.test(p) ? 3 * 3600 : 15 * 60) * 1000;               // lists: 15 minutes

const cors = (req, env) => {
  const o = req.headers.get("Origin") || "";
  const ok = env.ALLOWED_ORIGINS.split(",").includes(o) || /^http:\/\/localhost(:\d+)?$/.test(o);
  return ok ? { "Access-Control-Allow-Origin": o, Vary: "Origin" } : { Vary: "Origin" };
};
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");

export default {
  async fetch(req, env) {
    const c = cors(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...c, "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "*", "Access-Control-Max-Age": "86400" } });
    const url = new URL(req.url);
    const path = url.searchParams.get("u") || "";
    const acc = url.searchParams.get("acc") || "application/json";
    if (req.method !== "GET" || !ALLOWED.test(path) || path.length > 3000 || /apikey|authorization/i.test(path)) return new Response(JSON.stringify({ error: "not cacheable" }), { status: 400, headers: { ...c, "Content-Type": "application/json" } });

    const key = `v1/${await sha(`${path}|${acc}`)}`;
    const hit = await env.CACHE.get(key);
    const age = hit ? Date.now() - Number(hit.customMetadata?.t || 0) : Infinity;
    const out = (body, type, state) => new Response(body, { status: 200, headers: { ...c, "Content-Type": type, "Cache-Control": "public, max-age=60", "X-Ompath-Cache": state } });
    if (hit && age < ttl(path)) return out(hit.body, hit.customMetadata.ct, "hit");

    let r;
    try { r = await fetch(env.SUPABASE_URL + path, { headers: { apikey: env.SUPABASE_ANON_KEY, accept: acc } }); } catch { r = null; }
    if (r && r.status === 200) {
      const buf = await r.arrayBuffer();
      const ct = r.headers.get("content-type") || "application/json";
      await env.CACHE.put(key, buf, { customMetadata: { t: String(Date.now()), ct } });
      return out(buf, ct, "miss");
    }
    if (hit) return out(hit.body, hit.customMetadata.ct, "stale");                    // Supabase down or restricted: serve the saved copy
    return new Response(r ? await r.text() : JSON.stringify({ error: "upstream unavailable" }), { status: r ? r.status : 502, headers: { ...c, "Content-Type": r?.headers.get("content-type") || "application/json", "Cache-Control": "no-store" } });
  },
};
