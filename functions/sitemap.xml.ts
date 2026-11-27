import sitemapIndex from "../api/sitemap-index.js";
import { runVercelHandler } from "./_lib/vercel-adapter.js";

export const onRequestGet = async ({ request }: { request: Request }): Promise<Response> => {
  const host = new URL(request.url).hostname.toLowerCase();
  if (host === "stories.ompathstudy.com") {
    return new Response('<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://stories.ompathstudy.com/stories-sitemap.xml</loc></sitemap></sitemapindex>', { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=900" } });
  }
  return runVercelHandler(sitemapIndex, request);
};
