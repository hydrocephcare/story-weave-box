const BASE = (process.env.SEO_AUDIT_BASE_URL || "https://www.ompathstudy.com").replace(/\/$/, "");
const MAX_URLS = Number(process.env.SEO_AUDIT_MAX_URLS || 1000);
const CONCURRENCY = Number(process.env.SEO_AUDIT_CONCURRENCY || 10);
const TIMEOUT_MS = Number(process.env.SEO_AUDIT_TIMEOUT_MS || 15000);
const UA = "OpenSEO-Audit/1.0 OmpathStudySEOMonitor/1.0";

function normalize(url) {
  const u = new URL(url);
  u.hash = "";
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
  return u.toString();
}
async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
function locs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim()).filter(Boolean);
}
async function getSitemap(url, seen = new Set()) {
  if (seen.has(url)) return [];
  seen.add(url);
  const res = await fetchText(url, { headers: { "user-agent": UA, accept: "application/xml,text/xml,*/*" } });
  if (!res.ok) throw new Error(`Sitemap ${url} returned HTTP ${res.status}`);
  const xml = await res.text();
  if (!/<(?:urlset|sitemapindex)\b/i.test(xml) || /<error>/i.test(xml)) throw new Error(`Invalid sitemap XML at ${url}`);
  const entries = locs(xml);
  if (/<sitemapindex\b/i.test(xml)) {
    const nested = await Promise.all(entries.map((entry) => getSitemap(entry, seen)));
    return nested.flat();
  }
  return entries;
}
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }));
  return results;
}
function extractMeta(html, name) {
  const re = new RegExp(`<meta\\b[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["'][^>]*>`, "i");
  const reverse = new RegExp(`<meta\\b[^>]*content=["']([^"']*)["'][^>]*name=["']${name}["'][^>]*>`, "i");
  return (html.match(re) || html.match(reverse) || [])[1] || "";
}
function pageTitle(html) {
  return (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/<[^>]+>/g, "").trim() || "";
}
function canonical(html) {
  const m = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)
    || html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i);
  return m?.[1] || "";
}
function fail(msg) { return { ok: false, message: msg }; }

const errors = [];
const robotsRes = await fetchText(`${BASE}/robots.txt`, { headers: { "user-agent": UA } });
if (!robotsRes.ok) throw new Error(`robots.txt returned HTTP ${robotsRes.status}`);
const robots = await robotsRes.text();
const sitemapUrls = [...robots.matchAll(/^Sitemap:\s*(\S+)/gim)].map((m) => m[1]);
if (!sitemapUrls.length) throw new Error("robots.txt does not declare any sitemap URLs");

const all = [];
for (const sitemapUrl of sitemapUrls) {
  try {
    const entries = await getSitemap(sitemapUrl);
    // Image sitemaps intentionally repeat page URLs to attach image metadata.
    // Validate their XML, but do not count their locs as duplicate page URLs.
    if (!/image-sitemap/i.test(new URL(sitemapUrl).pathname)) all.push(...entries);
  }
  catch (e) { errors.push(fail(e.message)); }
}
const unique = [...new Set(all.map((u) => normalize(u)))];
for (const url of unique) {
  if (new URL(url).hostname !== "www.ompathstudy.com") errors.push(fail(`Unexpected sitemap host: ${url}`));
}
if (!unique.length) throw new Error("No page URLs were found in the declared sitemaps");
const duplicateCount = all.length - unique.length;
if (duplicateCount) errors.push(fail(`${duplicateCount} duplicate URL entries exist across the sitemaps`));

const indexable = unique.filter((u) => {
  const p = new URL(u).pathname;
  return !/^\/(?:admin|login|account|auth|my-revision|revision-planner|source-library|search|zone)(?:\/|$)/.test(p)
    && !/^\/clinical\/case\//.test(p)
    && !/^\/exams\/[^/]+\/start$/.test(p)
    && !/^\/contests\/[^/]+\/(?:register|lobby|progress|round|certificate)(?:\/|$)/.test(p);
});
const day = Math.floor(Date.now() / 86400000);
const start = (day * MAX_URLS) % indexable.length;
const rotated = [...indexable.slice(start), ...indexable.slice(0, start)];
const selected = MAX_URLS >= rotated.length ? rotated : rotated.slice(0, MAX_URLS);
console.log(`Sitemaps: ${sitemapUrls.length}; sitemap URLs: ${all.length}; unique: ${unique.length}; audited this run: ${selected.length}`);

const pageResults = await mapLimit(selected, CONCURRENCY, async (url) => {
  try {
    const res = await fetchText(url, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "manual" });
    if ([301, 302, 307, 308].includes(res.status)) return fail(`${url} redirects (HTTP ${res.status}); sitemap URLs must be final canonical URLs`);
    if (res.status !== 200) return fail(`${url} returned HTTP ${res.status}`);
    const html = await res.text();
    const title = pageTitle(html);
    const pathname = new URL(url).pathname;
    if (!/<h1\\b[^>]*>/i.test(html)) {
      return fail(`${url} is missing a primary H1 heading in the crawler response`);
    }
    if (pathname !== "/" && /^OmpathStudy \\| Medical Notes, MCQs & Exams$/i.test(title)) {
      return fail(`${url} returned the generic app-shell title instead of page-specific metadata`);
    }
    const can = canonical(html);
    if (!can) return fail(`${url} has no canonical link`);
    const resolved = normalize(new URL(can, url).toString());
    if (resolved !== normalize(url)) return fail(`${url} declares a different canonical: ${resolved}`);
    const robotsMeta = extractMeta(html, "robots").toLowerCase();
    const header = (res.headers.get("x-robots-tag") || "").toLowerCase();
    if (/noindex/.test(robotsMeta) || /noindex/.test(header)) return fail(`${url} is listed in a sitemap but sends noindex`);
    if (html.length < 500) return fail(`${url} returned an unusually small HTML document (${html.length} bytes)`);
    return { ok: true };
  } catch (e) {
    return fail(`${url}: ${e instanceof Error ? e.message : String(e)}`);
  }
});
for (const result of pageResults) if (!result.ok) errors.push(result);
const bad = pageResults.filter((r) => !r.ok).length;
console.log(`Page checks: ${selected.length - bad} passed; ${bad} failed`);
for (const e of errors.slice(0, 100)) console.error("SEO AUDIT:", e.message);
if (errors.length) {
  console.error(`SEO audit failed with ${errors.length} issue(s).`);
  process.exit(1);
}
console.log("SEO production audit passed.");
