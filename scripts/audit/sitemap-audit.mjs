// Fetches every address in the live sitemaps the way Googlebot does and fails when one is not fit for Google:
// not 200, redirecting, marked noindex, or declaring another page as its canonical.
//   node scripts/audit/sitemap-audit.mjs [https://www.ompathstudy.com]
// Run by .github/workflows/sitemap-audit.yml every week; a failed run is e-mailed to you by GitHub and lists the addresses.
const BASE = (process.argv[2] || "https://www.ompathstudy.com").replace(/\/$/, "");
const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const get = (u) => fetch(u, { headers: { "user-agent": UA }, redirect: "manual" });
const locs = (t) => [...t.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));

const robots = await (await get(`${BASE}/robots.txt`)).text();
const queue = new Set([`${BASE}/sitemap.xml`, ...[...robots.matchAll(/Sitemap:\s*(\S+)/gi)].map((m) => m[1])]);
const seenMaps = new Set(); const pages = new Map(); const problems = [];
for (const m of queue) {
  if (seenMaps.has(m)) continue; seenMaps.add(m);
  const r = await get(m);
  if (r.status !== 200) { problems.push(`SITEMAP ${r.status} ${m}`); continue; }
  for (const u of locs(await r.text())) { if (/\.xml($|\?)/.test(u)) queue.add(u); else if (!pages.has(u)) pages.set(u, m); }
}
console.log(`${seenMaps.size} sitemaps, ${pages.size} addresses`);

const list = [...pages.keys()]; let i = 0;
async function worker() {
  while (i < list.length) {
    const u = list[i++];
    try {
      const r = await get(u);
      if (r.status !== 200) { problems.push(`${r.status}${r.headers.get("location") ? " -> " + r.headers.get("location") : ""}  ${u}`); continue; }
      const html = await r.text();
      const xr = r.headers.get("x-robots-tag") || "";
      const robotsMeta = (html.match(/<meta name="robots" content="([^"]*)"/i) || [])[1] || "";
      if (/noindex/i.test(xr + robotsMeta)) { problems.push(`NOINDEX  ${u}`); continue; }
      const canon = (html.match(/<link rel="canonical" href="([^"]*)"/i) || [])[1];
      if (canon && canon.replace(/\/$/, "") !== u.replace(/\/$/, "")) problems.push(`CANONICAL -> ${canon}  ${u}`);
    } catch (e) { problems.push(`ERROR ${String(e).slice(0, 60)}  ${u}`); }
  }
}
await Promise.all(Array.from({ length: 12 }, worker));

if (problems.length) {
  console.log(`\n${problems.length} problem address(es):`);
  for (const p of problems.slice(0, 200)) console.log(" ", p);
  if (problems.length > 200) console.log(`  ... and ${problems.length - 200} more`);
  process.exit(1);
}
console.log("Every sitemap address answers 200, is indexable and has its own canonical.");
