export default function handler(req,res) {
  const host = String(req.headers.host || "").split(":")[0].toLowerCase();
  const stories = host === "stories.ompathstudy.com";
  res.setHeader("Content-Type","text/plain; charset=utf-8");
  res.setHeader("Cache-Control","public, s-maxage=3600, stale-while-revalidate=86400");
  if(stories) return res.status(200).send("User-agent: *\nAllow: /\nDisallow: /login\nDisallow: /auth/\nDisallow: /*?write=\nSitemap: https://stories.ompathstudy.com/sitemap.xml\n");
  return res.status(200).send("# OmpathStudy crawl policy\nUser-agent: *\nAllow: /\nDisallow: /contests/*/register\nDisallow: /contests/*/lobby\nDisallow: /contests/*/round/\nDisallow: /contests/*/progress\nDisallow: /contests/*/certificate/\nDisallow: /*?file=\nDisallow: /*&file=\nDisallow: /*?write=\nDisallow: /*?tab=\nDisallow: /*?trim=\nSitemap: https://www.ompathstudy.com/sitemap.xml\nSitemap: https://www.ompathstudy.com/library-sitemap.xml\nSitemap: https://www.ompathstudy.com/image-sitemap.xml\nSitemap: https://www.ompathstudy.com/dental-sitemap.xml\nSitemap: https://www.ompathstudy.com/it-sitemap.xml\nSitemap: https://www.ompathstudy.com/business-sitemap.xml\nSitemap: https://www.ompathstudy.com/hospitality-sitemap.xml\nSitemap: https://www.ompathstudy.com/social-sitemap.xml\nSitemap: https://www.ompathstudy.com/science-sitemap.xml\nSitemap: https://www.ompathstudy.com/research-sitemap.xml\n");
}
