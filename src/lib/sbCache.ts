/**
 * Cuts the data the site pulls from Supabase (the free plan limits it, and the site was blocked once for going over).
 * Public, read-only list and page queries from visitors who are not signed in go through a Cloudflare Worker that keeps the answers in R2 (15 minutes for lists, 3 hours for one article, a minute for settings; if Supabase is down the saved copy is served), so thousands of visits cost one database read. Identical requests made at the same moment are also merged into one.
 * Signed-in users, writes, counts and anything not on the list below go straight to Supabase, exactly as before. If the cache is unreachable the
 * request falls back to Supabase, so a cache problem can never take the site down.
 */
const CACHE_WORKER = "https://ompath-sb-cache.hydrocephcare.workers.dev"; // keeps the answers in Cloudflare R2 (no download fees), see cloudflare/workers/sb-cache
const PUBLIC_TABLES = "articles|mcq_sets|flashcard_sets|stories|essays|article_categories|app_settings|topic_pages|resource_topics|study_resources|academic_years|semesters|units|syllabus_topics|site_flags|article_comments|note_comments|slide_corrections|paper_answers|paper_seo|paper_similar|category_counts|search_aliases|pending_institutions|contest_university_results|medical_concepts|medical_concept_aliases|concept_relationships|contests|contest_universities|contest_rounds|rpc/exam_catalog";
export const PUBLIC_READ = new RegExp(`^/rest/v1/(${PUBLIC_TABLES})(\\?|$)`);

export function makeCachedFetch(baseUrl: string, anonKey: string, real: typeof fetch = (input, init) => fetch(input, init)): typeof fetch {
  const inflight = new Map<string, Promise<Response>>();
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const direct = () => real(input, init);
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method || (typeof input === "object" && "method" in input ? input.method : "GET") || "GET").toUpperCase();
      if (method !== "GET" || !url.startsWith(baseUrl)) return direct();
      const path = url.slice(baseUrl.length);
      if (!PUBLIC_READ.test(path)) return direct();
      const h = new Headers(init?.headers || (typeof input === "object" && "headers" in input ? input.headers : undefined));
      const auth = h.get("authorization") || "";
      if (auth && auth !== `Bearer ${anonKey}`) return direct();                  // a signed-in user: always fresh, straight from Supabase
      const range = h.get("range") || "", prefer = h.get("prefer") || "";
      if (!/^(\d+-\d*)?$/.test(range) || !/^(count=(exact|planned|estimated))?$/.test(prefer)) return direct(); // only pages and counts are cached; anything else goes to Supabase
      const accept = h.get("accept") || "";
      const key = `${path}|${accept}|${range}|${prefer}`;
      let p = inflight.get(key);
      if (!p) {
        const proxy = `${CACHE_WORKER}/?u=${encodeURIComponent(path)}${accept && accept !== "*/*" ? `&acc=${encodeURIComponent(accept)}` : ""}${range ? `&rg=${range}` : ""}${prefer ? `&pf=${prefer}` : ""}`;
        p = real(proxy, { method: "GET", signal: init?.signal ?? undefined }).then((r) => (r.ok || r.status === 404 || r.status === 406 || r.status === 416 ? r : direct()), () => direct());
        inflight.set(key, p);
        void p.finally(() => setTimeout(() => inflight.delete(key), 1500));
      }
      return (await p).clone();
    } catch { return direct(); }
  }) as typeof fetch;
}
