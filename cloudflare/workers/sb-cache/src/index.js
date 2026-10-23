// GET /?u=/rest/v1/articles?...&acc=application/json  Public, read-only Supabase queries for visitors who are not signed in.
// The answer is kept in R2. While it is fresh it is served from R2 and Supabase is not touched. When it is old it is fetched again, and if Supabase
// is down or restricted the old copy is served, so the site keeps working. Same list of tables as src/lib/sbCache.ts.
const ALLOWED = /^\/rest\/v1\/(articles|mcq_sets|flashcard_sets|stories|essays|article_categories|app_settings|topic_pages|resource_topics|study_resources|academic_years|semesters|units|syllabus_topics|site_flags|article_comments|note_comments|slide_corrections|paper_answers|paper_seo|paper_similar|blog_polish|category_counts|search_aliases|pending_institutions|contest_university_results|medical_concepts|medical_concept_aliases|concept_relationships|contests|contest_universities|contest_rounds|rpc\/exam_catalog)(\?|$)/;
const RPC = /^\/rest\/v1\/rpc\/(home_recent|category_counts|flashcard_catalog|exam_catalog)$/; // read-only functions, called with POST
const SHORT = /^\/rest\/v1\/(contests|contest_universities|contest_rounds|app_settings|site_flags|article_comments|note_comments)(\?|$)/; // things that change: 1 minute
const ONE = /[?&](id|slug)=eq\./;                                                                  // one article or set: 3 hours
const ttl = (p) => (RPC.test(p) ? 10 * 60 : SHORT.test(p) ? 60 : ONE.test(p) ? 3 * 3600 : 15 * 60) * 1000;               // lists: 15 minutes

const maxAge = (p) => (RPC.test(p) ? 120 : SHORT.test(p) ? 30 : ONE.test(p) ? 900 : 300); // seconds the browser keeps it
const cors = (req, env) => {
  const o = req.headers.get("Origin") || "";
  const ok = env.ALLOWED_ORIGINS.split(",").includes(o) || /^http:\/\/localhost(:\d+)?$/.test(o);
  return ok ? { "Access-Control-Allow-Origin": o, "Access-Control-Expose-Headers": "Content-Range", Vary: "Origin" } : { Vary: "Origin" };
};
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");

export default {
  async fetch(req, env, ctx) {
    const c = cors(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...c, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "*", "Access-Control-Max-Age": "86400" } });
    const url = new URL(req.url);
    const path = url.searchParams.get("u") || "";
    const acc = url.searchParams.get("acc") || "application/json";
    const rg = url.searchParams.get("rg") || "", pf = url.searchParams.get("pf") || "";
    if (!/^(\d+-\d*)?$/.test(rg) || !/^(count=(exact|planned|estimated))?$/.test(pf)) return new Response(JSON.stringify({ error: "bad header" }), { status: 400, headers: { ...c, "Content-Type": "application/json" } });
    const isRpc = req.method === "POST" && RPC.test(path);
    const rpcBody = isRpc ? await req.text() : "";
    if (isRpc && rpcBody.length > 2000) return new Response(JSON.stringify({ error: "too large" }), { status: 400, headers: { ...c, "Content-Type": "application/json" } });
    if (!isRpc && (req.method !== "GET" || !ALLOWED.test(path)) || path.length > 3000 || /apikey|authorization/i.test(path)) return new Response(JSON.stringify({ error: "not cacheable" }), { status: 400, headers: { ...c, "Content-Type": "application/json" } });

    const edge = caches.default, edgeKey = new Request(`${url.origin}/edge?o=${encodeURIComponent(req.headers.get("Origin") || "")}&u=${encodeURIComponent(path)}&a=${encodeURIComponent(acc)}&r=${rg}&p=${pf}&b=${encodeURIComponent(rpcBody)}`);
    const warm = await edge.match(edgeKey);
    if (warm) return warm;
    const key = `v1/${await sha(`${path}|${acc}|${rg}|${pf}|${rpcBody}`)}`;
    const hit = await env.CACHE.get(key);
    const age = hit ? Date.now() - Number(hit.customMetadata?.t || 0) : Infinity;
    const out = (body, type, state, cr, status = 200) => { const resp = new Response(body, { status, headers: { ...c, ...(cr ? { "Content-Range": cr } : {}), "Content-Type": type, "Cache-Control": `public, max-age=${maxAge(path)}, stale-while-revalidate=86400`, "X-Ompath-Cache": state } });
      if (state !== "stale") if (status === 200) ctx.waitUntil(edge.put(edgeKey, resp.clone()).catch(() => {})); return resp; };
    if (hit && age < ttl(path)) return out(hit.body, hit.customMetadata.ct, "hit", hit.customMetadata.cr, Number(hit.customMetadata.st || 200));

    let r;
    try { r = await fetch(env.SUPABASE_URL + path, { method: isRpc ? "POST" : "GET", ...(isRpc ? { body: rpcBody } : {}), headers: { ...(isRpc ? { "Content-Type": "application/json" } : {}), apikey: env.SUPABASE_ANON_KEY, accept: acc, ...(rg ? { Range: rg, "Range-Unit": "items" } : {}), ...(pf ? { Prefer: pf } : {}) } }); } catch { r = null; }
    if (r && (r.status === 200 || r.status === 206)) {
      const buf = await r.arrayBuffer();
      const ct = r.headers.get("content-type") || "application/json", cr = r.headers.get("content-range") || "";
      await env.CACHE.put(key, buf, { customMetadata: { t: String(Date.now()), ct, cr, st: String(r.status) } });
      return out(buf, ct, "miss", cr, r.status);
    }
    if (hit) return out(hit.body, hit.customMetadata.ct, "stale", hit.customMetadata.cr, Number(hit.customMetadata.st || 200));                    // Supabase down or restricted: serve the saved copy
    return new Response(r ? await r.text() : JSON.stringify({ error: "upstream unavailable" }), { status: r ? r.status : 502, headers: { ...c, "Content-Type": r?.headers.get("content-type") || "application/json", "Cache-Control": "no-store" } });
  },
};
