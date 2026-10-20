// Builds the dental paper index (src/data/dentalPapers.json) and the dental sitemap (public/dental-sitemap.xml) from the papers in src/content/dental.
// Run after adding or changing a paper:  node scripts/build-dental-index.mjs
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const dir = path.join(root, "src/content/dental");
const SITE = "https://www.ompathstudy.com";
const papers = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
const yearOf = (p) => (String(p.examTitle || "").match(/(20\d\d)\s*\/\s*(20\d\d)/)?.[0] ?? String(p.date || "").match(/20\d\d/)?.[0] ?? "").replace(/\s+/g, "");
const groupOf = (d) => /dental/i.test(d) ? "Dental Sciences" : /environment/i.test(d) ? "Environmental Health" : /community|communal|epidemiolog|biostat/i.test(d) ? "Community Health and Biostatistics" : /nutrition/i.test(d) ? "Nutrition and Dietetics" : /physical|natural|mathemat/i.test(d) ? "Natural Sciences" : /clinical/i.test(d) ? "Clinical Sciences" : "Other units";
const count = (p) => p.pages.reduce((n, pg) => n + pg.items.filter((i) => i.t === "q").length, 0);
const index = papers.map((p) => ({ slug: p.slug, title: p.title, unitCode: p.unitCode, unitTitle: p.unitTitle, programme: p.programme, date: p.date, year: yearOf(p), sitting: p.sitting, duration: p.duration, questions: count(p), complete: p.complete !== false, university: p.university, group: groupOf(String(p.department || "")) }))
  .sort((a, b) => (a.group === "Dental Sciences" ? 0 : 1) - (b.group === "Dental Sciences" ? 0 : 1) || a.group.localeCompare(b.group) || a.unitTitle.localeCompare(b.unitTitle) || String(b.year).localeCompare(String(a.year)));
fs.writeFileSync(path.join(root, "src/data/dentalPapers.json"), JSON.stringify(index, null, 1) + "\n");
const today = new Date().toISOString().slice(0, 10);
const urls = [`${SITE}/dental`, `${SITE}/dental/papers`, ...index.map((p) => `${SITE}/dental/papers/${p.slug}`)];
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n")}\n</urlset>\n`;
fs.writeFileSync(path.join(root, "public/dental-sitemap.xml"), xml);
console.log(`${index.length} papers indexed; ${urls.length} URLs in public/dental-sitemap.xml`);
