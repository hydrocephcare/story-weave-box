const BOT = /bot|crawl|spider|facebookexternalhit|whatsapp|twitterbot|slackbot|telegrambot|discordbot|gptbot|chatgpt-user|oai-searchbot|claudebot|anthropic-ai|perplexitybot|google-extended|applebot|bytespider|amazonbot|youbot|cohere-ai|mistralai|google-inspectiontool|googleother|storebot-google|adsbot-google|mediapartners-google|google-safety|openseo-audit|ompathstudyseomonitor|ahrefs|semrush/i;

const META_PREFIXES = [
  "/contests", "/blog", "/essays", "/stories", "/mcqs", "/flashcards", "/exams",
  "/ai", "/year/", "/papers", "/zone/", "/friend-zone", "/course-outlines",
  "/revision-pack", "/challenge", "/clinical", "/books", "/share-your-story",
  "/finalists",
];
const META_ALWAYS = [
  "/admin", "/login", "/account", "/auth", "/my-revision", "/revision-planner",
  "/source-library", "/submit-story", "/search",
];

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  const aliases = {
    "/api/ai-chat": "chat",
    "/api/topic-write": "topic",
    "/api/outline-parse": "outline",
    "/api/page-study": "study",
    "/api/ai-polish": "polish",
  };
  if (aliases[path]) {
    url.pathname = "/api/ai";
    url.searchParams.set("task", aliases[path]);
    return context.next(new Request(url, request));
  }

  const sitemapAliases = {
    "/topics-sitemap.xml": ["/api/sitemap", "mode", "topics"],
    "/research-sitemap.xml": ["/api/sitemap", "mode", "research"],
    "/sitemap.xml": ["/api/sitemap-index"],
    "/sitemap-dynamic.xml": ["/api/sitemap"],
  };
  if (sitemapAliases[path]) {
    const [destination, key, value] = sitemapAliases[path];
    url.pathname = destination;
    if (key) url.searchParams.set(key, value);
    return context.next(new Request(url, request));
  }
  const sitemapFile = path.match(/^\/sitemap\/([^/]+)$/);
  if (sitemapFile) {
    url.pathname = "/api/sitemap";
    url.searchParams.set("file", sitemapFile[1]);
    return context.next(new Request(url, request));
  }

  if (path.startsWith("/api/") || path.startsWith("/assets/") || /\.[a-z0-9]{2,8}$/i.test(path)) {
    return context.next();
  }

  const always = META_ALWAYS.some(route => path === route || path.startsWith(route + "/"));
  const bot = BOT.test(request.headers.get("user-agent") || "");
  const metaPath = META_PREFIXES.some(route => path === route || path.startsWith(route));
  const contestAction = /^\/contests\/[^/]+\/(register|lobby|progress|certificate|round)(\/|$)/.test(path);
  const examStart = /^\/exams\/[^/]+\/start$/.test(path);
  if (always || (bot && (metaPath || contestAction || examStart))) {
    const originalPath = path + url.search;
    url.pathname = "/api/og-meta";
    url.search = "";
    url.searchParams.set("path", originalPath);
    return context.next(new Request(url, request));
  }

  return context.next();
}
