import { neon } from "@neondatabase/serverless";

type Env = { DATABASE_URL?: string };
type Context = { request: Request; env: Env };

const ORIGIN = "https://stories.ompathstudy.com";
const escapeXml = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const onRequestGet = async ({ env }: Context): Promise<Response> => {
  if (!env.DATABASE_URL) {
    return new Response('<?xml version="1.0" encoding="UTF-8"?><error>Stories sitemap database is not configured</error>', {
      status: 503,
      headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store" },
    });
  }

  try {
    const rows = await neon(env.DATABASE_URL)`SELECT id,title,slug,created_at,cover_image_url
      FROM public.stories
      WHERE published = true AND deleted_at IS NULL AND password_protected = false
        AND (scheduled_at IS NULL OR scheduled_at <= now())
      ORDER BY created_at DESC LIMIT 10000`;

    const urls = [
      { loc: ORIGIN + "/" },
      { loc: ORIGIN + "/stories" },
      { loc: ORIGIN + "/share-your-story" },
    ];
    for (const story of rows) {
      const slug = String(story.slug || story.id);
      urls.push({
        loc: ORIGIN + "/stories/" + slug,
        lastmod: story.created_at,
        image: story.cover_image_url || "",
        title: story.title || "",
      });
    }

    const body = urls.map((item) =>
      "<url><loc>" + escapeXml(item.loc) + "</loc>" +
      (item.lastmod ? "<lastmod>" + escapeXml(new Date(item.lastmod).toISOString()) + "</lastmod>" : "") +
      (item.image ? "<image:image><image:loc>" + escapeXml(item.image) + "</image:loc><image:title>" + escapeXml(item.title) + "</image:title></image:image>" : "") +
      "</url>"
    ).join("");

    return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' + body + "</urlset>", {
      headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=900, s-maxage=3600", "x-ompath-stories-sitemap": "neon-v1" },
    });
  } catch (error) {
    console.error("[stories-sitemap] Neon lookup failed:", error instanceof Error ? error.message : String(error));
    return new Response('<?xml version="1.0" encoding="UTF-8"?><error>Stories sitemap temporarily unavailable</error>', {
      status: 503,
      headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store" },
    });
  }
};
