export default async function handler(req, res) {
  const sections = ["all.xml"];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sections.map((file) => `  <sitemap>\n    <loc>https://www.ompathstudy.com/sitemap/${file}</loc>\n  </sitemap>`).join("\n")}
  <sitemap>
    <loc>https://www.ompathstudy.com/library-sitemap.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://www.ompathstudy.com/image-sitemap.xml</loc>
  </sitemap>
${["dental", "it", "business", "hospitality", "social", "science"].map((name) => `  <sitemap>\n    <loc>https://www.ompathstudy.com/${name}-sitemap.xml</loc>\n  </sitemap>`).join("\n")}
</sitemapindex>`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).send(xml);
}