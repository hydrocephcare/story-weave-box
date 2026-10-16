import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = "https://dekyjrfwvavtoivqivno.supabase.co";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "sb_publishable_jOXeiFMWJj1z_M-zShimXA_cG9f2QxL";
const SITE_URL = "https://www.ompathstudy.com";

// Detect crawlers/bots
function isBot(ua: string): boolean {
  return /googlebot|bingbot|slurp|duckduckbot|facebot|twitterbot|linkedinbot|whatsapp|telegram|discordbot|applebot|rogerbot|semrushbot|ahrefsbot|mj12bot|petalbot|crawler|spider|prerender/i.test(ua);
}

function stripMarkdown(text: string, maxLen = 160): string {
  return (text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/[*_`>|#]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function extractFirstImage(content: string): string | null {
  return content.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i)?.[1] || null;
}

async function fetchArticleBySlug(slug: string) {
  // Try slug match first
  const slugRes = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?slug=eq.${encodeURIComponent(slug)}&select=id,title,content,meta_title,meta_description,og_image_url,category,created_at&limit=1`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  const slugData = await slugRes.json();
  if (slugData?.[0]) return slugData[0];

  // Fallback: extract UUID from slug param (e.g. "uuid-some-title")
  const uuidMatch = slug.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i);
  if (uuidMatch) {
    const idRes = await fetch(
      `${SUPABASE_URL}/rest/v1/articles?id=eq.${uuidMatch[1]}&select=id,title,content,meta_title,meta_description,og_image_url,category,created_at&limit=1`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    const idData = await idRes.json();
    return idData?.[0] || null;
  }
  return null;
}

async function fetchMcqBySlug(slug: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/mcq_sets?slug=eq.${encodeURIComponent(slug)}&select=id,title,description,category,created_at&limit=1`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  const data = await res.json();
  if (data?.[0]) return data[0];

  const uuidMatch = slug.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i);
  if (uuidMatch) {
    const idRes = await fetch(
      `${SUPABASE_URL}/rest/v1/mcq_sets?id=eq.${uuidMatch[1]}&select=id,title,description,category,created_at&limit=1`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    const idData = await idRes.json();
    return idData?.[0] || null;
  }
  return null;
}

async function fetchFlashcardBySlug(slug: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/flashcard_sets?slug=eq.${encodeURIComponent(slug)}&select=id,title,description,category,created_at&limit=1`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  const data = await res.json();
  if (data?.[0]) return data[0];

  const uuidMatch = slug.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i);
  if (uuidMatch) {
    const idRes = await fetch(
      `${SUPABASE_URL}/rest/v1/flashcard_sets?id=eq.${uuidMatch[1]}&select=id,title,description,category,created_at&limit=1`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    const idData = await idRes.json();
    return idData?.[0] || null;
  }
  return null;
}

function buildHtml(meta: {
  title: string;
  description: string;
  image: string;
  url: string;
  type: string;
  schema: object;
}): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(meta.title)}</title>
  <meta name="description" content="${esc(meta.description)}" />
  <link rel="canonical" href="${esc(meta.url)}" />
  <meta property="og:type" content="${meta.type}" />
  <meta property="og:title" content="${esc(meta.title)}" />
  <meta property="og:description" content="${esc(meta.description)}" />
  <meta property="og:image" content="${esc(meta.image)}" />
  <meta property="og:url" content="${esc(meta.url)}" />
  <meta property="og:site_name" content="Ompath Study" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(meta.title)}" />
  <meta name="twitter:description" content="${esc(meta.description)}" />
  <meta name="twitter:image" content="${esc(meta.image)}" />
  <script type="application/ld+json">${JSON.stringify(meta.schema)}</script>
</head>
<body>
  <h1>${esc(meta.title)}</h1>
  <p>${esc(meta.description)}</p>
  <a href="${esc(meta.url)}">View here</a>
</body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ua = req.headers["user-agent"] || "";
  const path = (req.query.path as string) || req.url || "/";

  // Only serve prerendered HTML to bots
  if (!isBot(ua)) {
    res.status(302).setHeader("Location", path).end();
    return;
  }

  const defaultImage = `${SITE_URL}/og-default.jpg`;

  try {
    // /blog/:slug
    const blogMatch = path.match(/^\/blog\/(.+)/);
    if (blogMatch) {
      const article = await fetchArticleBySlug(blogMatch[1]);
      if (article) {
        const title = `${(article.meta_title || article.title).replace(/^#+\s*/, "")}`;
        const description = article.meta_description
          ? stripMarkdown(article.meta_description, 160)
          : stripMarkdown(article.content || "", 160);
        const image = article.og_image_url || extractFirstImage(article.content || "") || defaultImage;
        const url = `${SITE_URL}/blog/${blogMatch[1]}`;

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(
          buildHtml({
            title, description, image, url, type: "article",
            schema: {
              "@context": "https://schema.org",
              "@type": "Article",
              headline: title,
              description,
              image,
              url,
              datePublished: article.created_at,
              author: { "@type": "Organization", name: "Ompath Study" },
              publisher: { "@type": "Organization", name: "Ompath Study" },
            },
          })
        );
      }
    }

    // /mcqs/:slug
    const mcqMatch = path.match(/^\/mcqs\/(.+)/);
    if (mcqMatch) {
      const mcq = await fetchMcqBySlug(mcqMatch[1]);
      if (mcq) {
        const title = `${mcq.title} – MCQ Quiz`;
        const description = mcq.description
          ? stripMarkdown(mcq.description, 160)
          : `Practice MCQ quiz on ${mcq.title}. Test your knowledge here.`;
        const url = `${SITE_URL}/mcqs/${mcqMatch[1]}`;

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(
          buildHtml({
            title, description, image: defaultImage, url, type: "article",
            schema: {
              "@context": "https://schema.org",
              "@type": "Quiz",
              name: title,
              description,
              url,
              datePublished: mcq.created_at,
              provider: { "@type": "Organization", name: "Ompath Study" },
            },
          })
        );
      }
    }

    // /flashcards/:slug
    const fcMatch = path.match(/^\/flashcards\/(.+)/);
    if (fcMatch) {
      const fc = await fetchFlashcardBySlug(fcMatch[1]);
      if (fc) {
        const title = `${fc.title} – Flashcards`;
        const description = fc.description
          ? stripMarkdown(fc.description, 160)
          : `Study flashcards for ${fc.title} here.`;
        const url = `${SITE_URL}/flashcards/${fcMatch[1]}`;

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(
          buildHtml({
            title, description, image: defaultImage, url, type: "article",
            schema: {
              "@context": "https://schema.org",
              "@type": "LearningResource",
              name: title,
              description,
              url,
              datePublished: fc.created_at,
              provider: { "@type": "Organization", name: "Ompath Study" },
            },
          })
        );
      }
    }
  } catch (err) {
    console.error("Prerender error:", err);
  }

  // Fallback: serve generic homepage meta
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(
    buildHtml({
      title: "Medical Study Platform",
      description: "Free medical study platform. Articles, flashcards, MCQ quizzes, and timed exams for Kenyan health students.",
      image: defaultImage,
      url: `${SITE_URL}${path}`,
      type: "website",
      schema: {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Ompath Study",
        url: SITE_URL,
        description: "Medical study platform for Kenyan health students.",
      },
    })
  );
}
