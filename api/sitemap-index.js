export default async function handler(req, res) {
  const host = String(req.headers.host || "").split(":")[0].toLowerCase();
  const mode = typeof req.query?.mode === "string" ? req.query.mode : "";
  if (mode === "robots") {
    const stories = host === "stories.ompathstudy.com";
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    const lines = stories ? [
      "User-agent: *","Allow: /","Disallow: /login","Disallow: /auth/","Disallow: /*?write=",
      "Sitemap: https://stories.ompathstudy.com/sitemap.xml",
      "","User-agent: Google-Extended","Disallow: /",
      "","User-agent: GPTBot","Disallow: /","User-agent: ChatGPT-User","Disallow: /","User-agent: OAI-SearchBot","Disallow: /",
      "User-agent: CCBot","Disallow: /","User-agent: ClaudeBot","Disallow: /","User-agent: anthropic-ai","Disallow: /",
      "User-agent: Claude-Web","Disallow: /","User-agent: PerplexityBot","Disallow: /","User-agent: Bytespider","Disallow: /",
      "User-agent: Amazonbot","Disallow: /","User-agent: Applebot-Extended","Disallow: /","User-agent: cohere-ai","Disallow: /",
      "User-agent: Diffbot","Disallow: /","User-agent: FacebookBot","Disallow: /","User-agent: meta-externalagent","Disallow: /",""
    ] : [
      "# OmpathStudy crawl policy","User-agent: *","Allow: /",
      "Disallow: /contests/*/register","Disallow: /contests/*/lobby","Disallow: /contests/*/round/","Disallow: /contests/*/progress","Disallow: /contests/*/certificate/",
      "Disallow: /*?file=","Disallow: /*&file=","Disallow: /*?write=","Disallow: /*?tab=","Disallow: /*?trim=",
      "Sitemap: https://www.ompathstudy.com/sitemap.xml","Sitemap: https://www.ompathstudy.com/library-sitemap.xml",
      "Sitemap: https://www.ompathstudy.com/image-sitemap.xml","Sitemap: https://www.ompathstudy.com/dental-sitemap.xml",
      "Sitemap: https://www.ompathstudy.com/it-sitemap.xml","Sitemap: https://www.ompathstudy.com/business-sitemap.xml",
      "Sitemap: https://www.ompathstudy.com/hospitality-sitemap.xml","Sitemap: https://www.ompathstudy.com/social-sitemap.xml",
      "Sitemap: https://www.ompathstudy.com/science-sitemap.xml","Sitemap: https://www.ompathstudy.com/research-sitemap.xml",
      "","User-agent: Google-Extended","Disallow: /","",
      "User-agent: GPTBot","Disallow: /","User-agent: ChatGPT-User","Disallow: /","User-agent: OAI-SearchBot","Disallow: /",
      "User-agent: CCBot","Disallow: /","User-agent: ClaudeBot","Disallow: /","User-agent: anthropic-ai","Disallow: /",
      "User-agent: Claude-Web","Disallow: /","User-agent: PerplexityBot","Disallow: /","User-agent: Bytespider","Disallow: /",
      "User-agent: Amazonbot","Disallow: /","User-agent: Applebot-Extended","Disallow: /","User-agent: cohere-ai","Disallow: /",
      "User-agent: Diffbot","Disallow: /","User-agent: FacebookBot","Disallow: /","User-agent: meta-externalagent","Disallow: /",""
    ];
    return res.status(200).send(lines.join("\n"));
  }
  if (host === "stories.ompathstudy.com") {
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=86400");
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://stories.ompathstudy.com/stories-sitemap.xml</loc></sitemap></sitemapindex>');
  }
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