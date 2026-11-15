import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const meta = read("api/og-meta.ts");
const sitemap = read("api/sitemap.js");
const robots = read("public/robots.txt");

const checks = [
  ["temporary crawler failures use retryable 503 responses", /status:\s*503/.test(meta) && /"retry-after":\s*"300"/.test(meta)],
  ["temporary crawler failures do not permanently redirect to a section hub", !meta.includes("return permanentRedirect(safeSection)") && !meta.includes("const safeSection")],
  ["interactive clinical cases are excluded from the sitemap", sitemap.includes("clinical") && sitemap.includes("case")],
  ["exam start routes are excluded from the sitemap", sitemap.includes("exams") && sitemap.includes("start")],
  ["sitemap filters known removed URLs", sitemap.includes("REMOVED_404")],
  ["robots.txt publishes the primary sitemap", /Sitemap:\s*https:\/\/www\.ompathstudy\.com\/sitemap\.xml/i.test(robots)],
  ["robots.txt permits public crawling by default", /User-agent:\s*\*\s*\nAllow:\s*\//i.test(robots)],
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
