// /topics-sitemap.xml: topic pages that were written after the last deploy (so they are in the sitemap the moment they are published).
// The pages built at deploy time are already in library-sitemap.xml; this lists only the ones published since, from the topic_pages table.
const SITE = "https://www.ompathstudy.com";
const DB = "https://strfwaqvxvkhjbqrwmla.supabase.co";
// the public (anon) key the website already ships with; the table only lets readers see published pages
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0cmZ3YXF2eHZraGpicXJ3bWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MTIwNzEsImV4cCI6MjEwODI4ODA3MX0.F_bGNSKsC6Wbriit19-OIwNdScqAUU0yhJ3TtQuiTkE";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  try {
    const key = KEY;
    const [rowsRes, indexRes] = await Promise.all([
      fetch(`${DB}/rest/v1/topic_pages?select=slug,updated_at&status=eq.published&order=updated_at.desc&limit=2000`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }),
      fetch(`${SITE}/topics/index.json`),
    ]);
    const rows = rowsRes.ok ? await rowsRes.json() : [];
    const indexed = new Set(indexRes.ok && (indexRes.headers.get("content-type") || "").includes("json") ? (await indexRes.json()).map((t) => t.s) : []);
    const fresh = rows.filter((r) => r.slug && !indexed.has(r.slug));
    const top = `  <url>\n    <loc>${SITE}/topics</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n  </url>`;
    const urls = [top, ...fresh.map((r) => `  <url>\n    <loc>${SITE}/topic/${r.slug}</loc>\n    <lastmod>${String(r.updated_at).slice(0, 10)}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`)].join("\n");
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=86400");
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);
  } catch {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${SITE}/topics</loc>\n  </url>\n</urlset>`);
  }
}
