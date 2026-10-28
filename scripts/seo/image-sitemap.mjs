// Builds public/image-sitemap.xml: every picture on the site that Google may index, listed under the page that shows it
// (notes, blog posts and their cover pictures, topic pages, OSCE stations, past-paper figures). Only pictures on our own addresses are listed
// (ompathstudy.com and cdn.ompathstudy.com). Run by the daily workflow after the topic pages are built, and by hand:  node scripts/seo/image-sitemap.mjs
import fs from "node:fs";
import path from "node:path";

const ORIGIN = "https://www.ompathstudy.com";
const WORKER = "https://ompath-sb-cache.hydrocephcare.workers.dev";
const OWN = /^https:\/\/(www\.|cdn\.)?ompathstudy\.com\//i;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// the public address of a page drops the hash the database adds to a slug (the same rule the page renderer uses), so the sitemap never lists an address that redirects
const pub = (slug) => String(slug || "").trim().toLowerCase().replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, "").replace(/-[0-9a-f]{6,12}$/i, "").replace(/-+/g, "-").replace(/^-|-$/g, "");

// addresses that redirect (vercel.json) are never listed: a sitemap holds only the final page
const REDIRECTED = new Set((JSON.parse(fs.readFileSync("vercel.json", "utf8")).redirects || []).map((r) => r.source));

const pages = new Map(); // page url -> Map(image url -> caption)
const add = (page, img, caption = "") => {
  let u = String(img || "").trim();
  if (!u || u.startsWith("data:")) return;
  if (u.startsWith("//")) u = "https:" + u; else if (u.startsWith("/")) u = ORIGIN + u;
  u = u.replace(/^https:\/\/ompathstudy\.com\//i, `${ORIGIN}/`);
  try { if (REDIRECTED.has(new URL(page).pathname)) return; } catch { /* keep going */ }
  if (!OWN.test(u) || !/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u)) return;
  if (/og-default|placeholder|\/icon-|favicon/i.test(u)) return;
  if (!pages.has(page)) pages.set(page, new Map());
  const m = pages.get(page); if (!m.has(u)) m.set(u, String(caption || "").replace(/\s+/g, " ").trim().slice(0, 200));
};
const fromMarkdown = (page, text) => {
  for (const m of String(text || "").matchAll(/!\[([^\]]*)\]\(([^)\s]+)/g)) add(page, m[2], m[1]);
  for (const m of String(text || "").matchAll(/<img[^>]+src="([^"]+)"[^>]*?(?:alt="([^"]*)")?/g)) add(page, m[1], m[2] || "");
};

// 1. Study notes, blog posts and MCQ covers: the daily workflow keeps a copy of the library in .cache (otherwise read what the cache worker holds)
let corpus = null;
try { corpus = JSON.parse(fs.readFileSync(".cache/topics-corpus.json", "utf8")); } catch { /* no local copy */ }
if (corpus) {
  for (const a of corpus.articles || []) fromMarkdown(`${ORIGIN}/blog/${pub(a.slug)}`, a.content);
  for (const n of corpus.notes || []) fromMarkdown(`${ORIGIN}/notes/${n.slug}`, n.text);
}
// cover pictures are small columns; read them through the cache worker (answers are cached, so this costs the database nothing)
async function rows(table, cols) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const p = `/rest/v1/${table}?select=${cols}&published=eq.true&deleted_at=is.null&order=created_at.desc`;
    try {
      const r = await fetch(`${WORKER}/?bt=1&u=${encodeURIComponent(p)}&rg=${from}-${from + 999}`);
      if (!r.ok) break;
      const d = await r.json(); out.push(...d);
      if (d.length < 1000) break;
    } catch { break; }
  }
  return out;
}
for (const a of await rows("articles", "slug,title,featured_image,og_image_url")) { add(`${ORIGIN}/blog/${pub(a.slug)}`, a.featured_image, a.title); add(`${ORIGIN}/blog/${pub(a.slug)}`, a.og_image_url, a.title); }
for (const m of await rows("mcq_sets", "slug,title,featured_image,og_image_url")) { add(`${ORIGIN}/mcqs/${pub(m.slug)}`, m.featured_image, m.title); add(`${ORIGIN}/mcqs/${pub(m.slug)}`, m.og_image_url, m.title); }
for (const s of await rows("stories", "id,slug,title,cover_image_url")) add(`${ORIGIN}/stories/${s.slug || s.id}`, s.cover_image_url, s.title);

// 2. Topic pages: figures taken from the notes, shown on the topic page
for (const f of fs.readdirSync("public/topics").filter((x) => x.endsWith(".json") && x !== "index.json" && x !== "aliases.json")) {
  try { const t = JSON.parse(fs.readFileSync(path.join("public/topics", f), "utf8")); for (const im of t.imgs || []) add(`${ORIGIN}/topic/${t.s}`, im.u, im.a || t.n); } catch { /* skip a damaged file */ }
}

// 3. Pictures that ship with the site
const folder = (dir, page, caption) => { try { for (const f of fs.readdirSync(dir)) add(page, `/${dir.replace(/^public\//, "")}/${f}`, caption(f)); } catch { /* folder missing */ } };
folder("public/osce/y19", `${ORIGIN}/clinical/osce-2019`, (f) => `Internal Medicine OSCE 2019 ${f.replace(/\.\w+$/, "").replace(/[-_]/g, " ")}`);
try { for (const f of fs.readdirSync("public/osce").filter((x) => /^station-\d+\.jpg$/.test(x))) add(`${ORIGIN}/clinical/osce-stations`, `/osce/${f}`, `Internal Medicine OSCE ${f.replace(/\.jpg$/, "").replace("-", " ")}`); } catch { /* none */ }

// 4. Write it (Google reads up to 50,000 pages and 1,000 pictures per page in one file)
// topic pages without a written overview are marked noindex by the page itself: do not list their pictures
const topics = [...pages.keys()].filter((p) => p.startsWith(`${ORIGIN}/topic/`));
await Promise.all(Array.from({ length: 8 }, async () => { for (let p; (p = topics.pop()); ) { try { const r = await fetch(p, { headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" } }); const h = r.ok ? await r.text() : ""; if (!r.ok || /<meta name="robots" content="[^"]*noindex/i.test(h)) pages.delete(p); } catch { /* keep it when the check fails */ } } }));
const list = [...pages.entries()].filter(([, m]) => m.size).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 50000);
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
  list.map(([page, m]) => `  <url>\n    <loc>${esc(page)}</loc>\n${[...m.entries()].slice(0, 1000).map(([u, c]) => `    <image:image>\n      <image:loc>${esc(u)}</image:loc>${c ? `\n      <image:caption>${esc(c)}</image:caption>` : ""}\n    </image:image>`).join("\n")}\n  </url>`).join("\n") + `\n</urlset>\n`;
fs.writeFileSync("public/image-sitemap.xml", xml);
console.log(`image sitemap: ${list.length} pages, ${list.reduce((n, [, m]) => n + m.size, 0)} pictures`);
