export default async function handler(req, res) {
  const sections = [
    "pages.xml",
    "blog-year-1.xml",
    "blog-year-2.xml",
    "blog-year-3.xml",
    "blog-year-4.xml",
    "blog-year-5.xml",
    "blog-year-6.xml",
    "mcqs-year-1.xml",
    "mcqs-year-2.xml",
    "mcqs-year-3.xml",
    "mcqs-year-4.xml",
    "mcqs-year-5.xml",
    "mcqs-year-6.xml",
    "flashcards-year-1.xml",
    "flashcards-year-2.xml",
    "flashcards-year-3.xml",
    "flashcards-year-4.xml",
    "flashcards-year-5.xml",
    "flashcards-year-6.xml",
    "stories.xml",
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sections.map((file) => `  <sitemap>\n    <loc>https://www.ompathstudy.com/sitemap/${file}</loc>\n  </sitemap>`).join("\n")}
</sitemapindex>`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).send(xml);
}