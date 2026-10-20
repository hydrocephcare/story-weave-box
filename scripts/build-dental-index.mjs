// Tidies the dental papers, builds the paper index (src/data/dentalPapers.json) and the dental sitemaps (public/dental-sitemap*.xml): one index file that
// points to a hubs sitemap (home, categories, units) and one sitemap of papers per category.
// Run after adding or changing a paper:  node scripts/build-dental-index.mjs
import fs from "node:fs";
import path from "node:path";
import { normalisePaper, CATEGORIES } from "./normalise-dental.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const dir = path.join(root, "src/content/dental");
const SITE = "https://www.ompathstudy.com";
const papers = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => {
  const p = normalisePaper(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  fs.writeFileSync(path.join(dir, f), JSON.stringify(p, null, 1) + "\n");
  return p;
});
const count = (p) => p.pages.reduce((n, pg) => n + pg.items.filter((i) => i.t === "q").length, 0);
const order = [...CATEGORIES.map((c) => c.slug), "other-units"];
const index = papers.map((p) => ({
  slug: p.slug, title: p.title, unitCode: p.unitCode, unitTitle: p.unitTitle, unitSlug: p.unitSlug, programme: p.programmes.join(" · ") || p.programme, programmes: p.programmes,
  date: p.dateLabel, dateISO: p.dateISO, year: (p.dateISO || "").slice(0, 4), sitting: p.sitting, duration: p.duration, questions: count(p), complete: p.complete !== false,
  university: p.university, group: p.category, categorySlug: p.categorySlug,
})).sort((a, b) => order.indexOf(a.categorySlug) - order.indexOf(b.categorySlug) || a.unitTitle.localeCompare(b.unitTitle) || String(b.dateISO).localeCompare(String(a.dateISO)));
fs.writeFileSync(path.join(root, "src/data/dentalPapers.json"), JSON.stringify(index, null, 1) + "\n");

// every question's wording, for searching inside the papers: [slug, question number, text]
const flat = (parts, stem) => (parts || []).flatMap((x) => [`${stem} ${x.l ? x.l + ") " : ""}${x.text}`.trim(), ...flat(x.parts, "")]);
const qtext = papers.flatMap((p) => p.pages.flatMap((pg) => pg.items).filter((i) => i.t === "q").map((i) => [p.slug, i.n, [i.text, ...flat(i.parts, "")].join(" ").replace(/\s+/g, " ").trim().slice(0, 260)]));
fs.writeFileSync(path.join(root, "src/data/dentalQuestions.json"), JSON.stringify(qtext));
const today = new Date().toISOString().slice(0, 10);
const urlset = (urls) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.freq || "monthly"}</changefreq><priority>${u.pri || "0.6"}</priority></url>`).join("\n")}\n</urlset>\n`;
const out = (name, body) => fs.writeFileSync(path.join(root, "public", name), body);
const cats = order.filter((c) => index.some((p) => p.categorySlug === c));
const units = [...new Map(index.map((p) => [p.unitSlug, p])).values()];
out("dental-sitemap-hubs.xml", urlset([
  { loc: `${SITE}/dental`, freq: "weekly", pri: "0.9" }, { loc: `${SITE}/dental/papers`, freq: "weekly", pri: "0.8" },
  ...cats.map((c) => ({ loc: `${SITE}/dental/category/${c}`, pri: "0.8" })), ...units.map((u) => ({ loc: `${SITE}/dental/units/${u.unitSlug}`, pri: "0.7" })),
]));
for (const c of cats) out(`dental-sitemap-${c}.xml`, urlset(index.filter((p) => p.categorySlug === c).map((p) => ({ loc: `${SITE}/dental/papers/${p.slug}`, pri: "0.6" }))));
// the old single-file address stays as the entry point: a sitemap index
out("dental-sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${["hubs", ...cats].map((n) => `  <sitemap><loc>${SITE}/dental-sitemap-${n}.xml</loc><lastmod>${today}</lastmod></sitemap>`).join("\n")}\n</sitemapindex>\n`);
console.log(`${index.length} papers, ${cats.length} categories, ${units.length} units; sitemaps written`);
