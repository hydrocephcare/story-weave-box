// Tidies the past papers, builds the paper index (src/data/dentalPapers.json), the question search file and the sitemaps.
// The site has one section per course (src/data/sections.json): dental, it, business, hospitality, social, science. Each section gets its own sitemap index
// (dental keeps the address /dental-sitemap.xml; the others are /it-sitemap.xml and so on) pointing to a hubs sitemap and one sitemap per category.
// Run after adding or changing a paper:  node scripts/build-dental-index.mjs
import fs from "node:fs";
import path from "node:path";
import { normalisePaper, CATEGORIES } from "./normalise-dental.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const dir = path.join(root, "src/content/dental");
const SITE = "https://www.ompathstudy.com";
const SECTIONS = JSON.parse(fs.readFileSync(path.join(root, "src/data/sections.json"), "utf8"));
const sectionOf = (cat) => (SECTIONS.find((x) => x.categories.includes(cat)) ?? SECTIONS[SECTIONS.length - 1]).slug;
const NL = String.fromCharCode(10);
const write = (p) => fs.writeFileSync(path.join(dir, p.slug + ".json"), JSON.stringify(p, null, 1) + NL);

let papers = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => normalisePaper(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))));
// the same paper filed under several programmes is one paper: keep the first, add the others' programmes to it, delete the copies
{
  const norm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const sig = (p) => p.pages.flatMap((g) => g.items).filter((i) => i.t === "q").slice(0, 4).map((i) => norm(i.text + (i.parts || []).map((x) => x.text).join("")).slice(0, 40)).join("|");
  const keep = new Map(); const gone = new Set();
  for (const p of papers) {
    const s = sig(p); if (!s) continue;
    const k = [norm(p.unitCode), p.dateISO, norm(p.sitting), s].join("#");
    const first = keep.get(k);
    if (!first) { keep.set(k, p); continue; }
    first.programmes = [...new Set([...(first.programmes || []), ...(p.programmes || [])])];
    fs.unlinkSync(path.join(dir, p.slug + ".json")); gone.add(p.slug);
  }
  papers = papers.filter((p) => !gone.has(p.slug));
  for (const p of papers) write(p);
  if (gone.size) console.log("duplicate papers merged:", gone.size);
}

const count = (p) => p.pages.reduce((n, pg) => n + pg.items.filter((i) => i.t === "q").length, 0);
const order = [...CATEGORIES.map((c) => c.slug), "other-units"];
const index = papers.map((p) => ({
  slug: p.slug, title: p.title, unitCode: p.unitCode, unitTitle: p.unitTitle, unitSlug: p.unitSlug, programme: p.programmes.join(" · ") || p.programme, programmes: p.programmes,
  date: p.dateLabel, dateISO: p.dateISO, year: (p.dateISO || "").slice(0, 4), sitting: p.sitting, duration: p.duration, questions: count(p), complete: p.complete !== false,
  university: p.university, group: p.category, categorySlug: p.categorySlug, section: sectionOf(p.categorySlug),
})).sort((a, b) => order.indexOf(a.categorySlug) - order.indexOf(b.categorySlug) || a.unitTitle.localeCompare(b.unitTitle) || String(b.dateISO).localeCompare(String(a.dateISO)));
fs.writeFileSync(path.join(root, "src/data/dentalPapers.json"), JSON.stringify(index, null, 1) + NL);
fs.writeFileSync(path.join(root, "src/data/dentalCategories.json"), JSON.stringify([...CATEGORIES.map((c) => ({ slug: c.slug, name: c.name, blurb: c.blurb })), { slug: "other-units", name: "Other Units", blurb: "More units from the same colleges." }], null, 1) + NL);

// every question's wording, for searching inside the papers: [slug, anchor id, text]
const flat = (parts, stem) => (parts || []).flatMap((x) => [`${stem} ${x.l ? x.l + ") " : ""}${x.text}`.trim(), ...flat(x.parts, "")]);
const qtext = papers.flatMap((p) => p.pages.flatMap((pg) => pg.items).filter((i) => i.t === "q").map((i) => [p.slug, i.id || ("q" + i.n), [i.text, ...flat(i.parts, "")].join(" ").replace(/\s+/g, " ").trim().slice(0, 260)]));
fs.writeFileSync(path.join(root, "src/data/dentalQuestions.json"), JSON.stringify(qtext));

// sitemaps: remove the old ones, then one index per section
const today = new Date().toISOString().slice(0, 10);
for (const f of fs.readdirSync(path.join(root, "public"))) if (/^(dental|it|business|hospitality|social|science)-sitemap.*\.xml$/.test(f)) fs.unlinkSync(path.join(root, "public", f));
const urlset = (urls) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.freq || "monthly"}</changefreq><priority>${u.pri || "0.6"}</priority></url>`).join("\n")}\n</urlset>\n`;
const out = (name, body) => fs.writeFileSync(path.join(root, "public", name), body);
const names = [];
for (const sec of SECTIONS) {
  const rows = index.filter((p) => p.section === sec.slug); if (!rows.length) continue;
  const cats = order.filter((c) => rows.some((p) => p.categorySlug === c));
  const units = [...new Map(rows.map((p) => [p.unitSlug, p])).values()];
  const base = `${SITE}/${sec.slug}`;
  out(`${sec.slug}-sitemap-hubs.xml`, urlset([{ loc: base, freq: "weekly", pri: "0.9" }, { loc: `${base}/papers`, freq: "weekly", pri: "0.8" }, ...cats.map((c) => ({ loc: `${base}/category/${c}`, pri: "0.8" })), ...units.map((u) => ({ loc: `${base}/units/${u.unitSlug}`, pri: "0.7" }))]));
  for (const c of cats) out(`${sec.slug}-sitemap-${c}.xml`, urlset(rows.filter((p) => p.categorySlug === c).map((p) => ({ loc: `${base}/papers/${p.slug}`, pri: "0.6" }))));
  out(`${sec.slug}-sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${["hubs", ...cats].map((n) => `  <sitemap><loc>${SITE}/${sec.slug}-sitemap-${n}.xml</loc><lastmod>${today}</lastmod></sitemap>`).join("\n")}\n</sitemapindex>\n`);
  names.push(sec.slug);
}
// robots.txt lists each section's sitemap
{
  const rp = path.join(root, "public/robots.txt"); let r = fs.readFileSync(rp, "utf8").split(NL).filter((l) => !/^Sitemap: .*\/(dental|it|business|hospitality|social|science)-sitemap\.xml$/.test(l.trim()));
  while (r.length && r[r.length - 1].trim() === "") r.pop();
  r.push(...names.map((n) => `Sitemap: ${SITE}/${n}-sitemap.xml`), "");
  fs.writeFileSync(rp, r.join(NL));
}
console.log(`${index.length} papers, ${names.length} sections (${names.join(", ")}), ${new Set(index.map((p) => p.unitSlug)).size} units; sitemaps written`);
