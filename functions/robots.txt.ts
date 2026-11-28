import sitemapIndex from "../api/_lib/sitemap-index.js";
import { runVercelHandler } from "./_lib/vercel-adapter.js";

const STORIES_ROBOTS = "User-agent: *\nAllow: /\nDisallow: /login\nDisallow: /auth/\nDisallow: /*?write=\nSitemap: https://stories.ompathstudy.com/sitemap.xml\n\nUser-agent: Google-Extended\nDisallow: /\nUser-agent: GPTBot\nDisallow: /\nUser-agent: ChatGPT-User\nDisallow: /\nUser-agent: OAI-SearchBot\nDisallow: /\nUser-agent: ClaudeBot\nDisallow: /\nUser-agent: PerplexityBot\nDisallow: /\n";

export const onRequestGet = async ({ request }: { request: Request }): Promise<Response> => {
  const host = new URL(request.url).hostname.toLowerCase();
  if (host === "stories.ompathstudy.com") {
    return new Response(STORIES_ROBOTS, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
  }
  const url = new URL("/api/sitemap-index?mode=robots", request.url);
  return runVercelHandler(sitemapIndex, new Request(url, request));
};
