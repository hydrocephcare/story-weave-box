const BASE = (process.env.SEO_AUDIT_BASE_URL || "https://www.ompathstudy.com").replace(/\/$/, "");
const MAX_URLS = Number(process.env.SEO_AUDIT_MAX_URLS || 1000);
const CONCURRENCY = Number(process.env.SEO_AUDIT_CONCURRENCY || 10);
const TIMEOUT_MS = Number(process.env.SEO_AUDIT_TIMEOUT_MS || 15000);
const MIN_VISIBLE_WORDS = Number(process.env.SEO_AUDIT_MIN_VISIBLE_WORDS || 80);
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
  return entries.map((entry) => ({ url: entry, source: url }));
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
function visibleWordCount(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<div[^>]*class=["\'][^"\']*boot-loader[^"\']*["\'][^>]*>[\s\S]*?<\/div>/gi, " ")
    .replace(/<div[^>]*class=["\'][^"\']*seo-fallback[^"\']*["\'][^>]*>[\s\S]*?<\/div>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.split(" ").length : 0;
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
// robots.txt may declare both a sitemap index and its child files. Share the
// visited-file set across roots so each XML document is read once.
const visitedSitemapFiles = new Set();
for (const sitemapUrl of sitemapUrls) {
  try {
    const entries = await getSitemap(sitemapUrl, visitedSitemapFiles);
    // Image sitemaps are nested inside indexes as well as declared directly.
    // Validate them, but do not count their repeated page locs as page duplicates.
    all.push(...entries.filter((entry) => !/image-sitemap/i.test(new URL(entry.source).pathname)));
  }
  catch (e) { errors.push(fail(e.message)); }
}
const normalizedEntries = all.map((entry) => ({ url: normalize(entry.url), source: entry.source }));
const unique = [...new Set(normalizedEntries.map((entry) => entry.url))];
for (const url of unique) {
  if (new URL(url).hostname !== "www.ompathstudy.com") errors.push(fail(`Unexpected sitemap host: ${url}`));
}
if (!unique.length) throw new Error("No page URLs were found in the declared sitemaps");
const byUrl = new Map();
for (const entry of normalizedEntries) {
  const sources = byUrl.get(entry.url) || [];
  sources.push(entry.source);
  byUrl.set(entry.url, sources);
}
const duplicateEntries = [...byUrl].filter(([, sources]) => sources.length > 1);
const duplicateCount = normalizedEntries.length - unique.length;
if (duplicateCount) {
  errors.push(fail(`${duplicateCount} duplicate URL entries exist across the sitemaps`));
  for (const [url, sources] of duplicateEntries.slice(0, 20)) {
    console.log(`SEO DUPLICATE SOURCE: ${url} appears in ${[...new Set(sources)].join(", ")}`);
  }
}

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
console.log(`Sitemaps: ${sitemapUrls.length}; page sitemap URLs: ${normalizedEntries.length}; unique: ${unique.length}; audited this run: ${selected.length}`);

const pageResults = await mapLimit(selected, CONCURRENCY, async (url) => {
  try {
    const res = await fetchText(url, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "manual" });
    if ([301, 302, 307, 308].includes(res.status)) return fail(`${url} redirects (HTTP ${res.status}); sitemap URLs must be final canonical URLs`);
    if (res.status !== 200) return fail(`${url} returned HTTP ${res.status}`);
    const html = await res.text();
    const title = pageTitle(html);
    const pathname = new URL(url).pathname;
    if (/class=["\'][^"\']*prerendered[^"\']*["\']/i.test(html) && /(clip:rect\(0 0 0 0\)|visibility\s*:\s*hidden|display\s*:\s*none)/i.test(html)) {
      return fail(`${url} has prerendered content hidden from crawlers: hidden prerender wrapper or blocking loader`);
    }
    if (!/<h1\b[^>]*>/i.test(html)) {
      return fail(`${url} is missing a primary H1 heading in the crawler response`);
    }
    if (pathname !== "/" && /^OmpathStudy \| Medical Notes, MCQs & Exams$/i.test(title)) {
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
    const visibleWords = visibleWordCount(html);
    if (visibleWords < MIN_VISIBLE_WORDS) return fail(`${url} is too thin for indexing: ${visibleWords} visible words (minimum ${MIN_VISIBLE_WORDS})`);
    return { ok: true, url, title: title.replace(/\s+/g, " ").trim() };
  } catch (e) {
    return fail(`${url}: ${e instanceof Error ? e.message : String(e)}`);
  }
});
for (const result of pageResults) if (!result.ok) errors.push(result);

// Detect duplicate titles across the current sitemap sample. The rotating sample
// covers the full indexable URL set over successive runs without overloading production.
const titleOwners = new Map();
for (const result of pageResults) {
  if (!result.ok || !result.title) continue;
  const key = result.title.toLowerCase();
  if (!titleOwners.has(key)) titleOwners.set(key, []);
  titleOwners.get(key).push(result.url);
}
for (const [title, urls] of titleOwners) {
  if (urls.length > 1) errors.push(fail(`Duplicate page title "${title}" appears on: ${urls.join(", ")}`));
}
const bad = pageResults.filter((r) => !r.ok).length;
console.log(`Page checks: ${selected.length - bad} passed; ${bad} failed`);
for (const e of errors.slice(0, 100)) console.error("SEO AUDIT:", e.message);
if (errors.length) {
  console.error(`SEO audit failed with ${errors.length} issue(s).`);
  process.exit(1);
}
console.log("SEO production audit passed.");
