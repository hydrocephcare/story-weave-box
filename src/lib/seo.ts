import { supabase } from "@/integrations/supabase/client";

export const SITE_URL = "https://www.ompathstudy.com"; // ✅ fixed: added www

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function slugifyText(value: string): string {
  return (value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function stripRichText(input: string, maxLength?: number): string {
  const normalized = (input || "")
    .replace(/<[^>]*>/g, " ") // Remove HTML tags
    .replace(/!\[[^\]]*\]\((.*?)\)/g, " ") // Remove markdown images
    .replace(/\[[^\]]+\]\((.*?)\)/g, "$1") // Remove markdown links, keep text
    .replace(/^#+\s+/gm, "") // Remove headers
    .replace(/[\*_`>|]/g, " ") // Remove bold, italic, code, blockquote, table pipes
    .replace(/#\w+/g, "") // Remove hashtags
    .replace(/\s+/g, " ") // Consolidate whitespace
    .trim();

  if (typeof maxLength === "number" && maxLength > 0) {
    return normalized.slice(0, maxLength);
  }

  return normalized;
}

export function extractFirstImageFromContent(content: string): string | null {
  if (!content) return null;

  const markdownImage = content.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i)?.[1];
  if (markdownImage) return markdownImage;

  const htmlImage = content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1];
  return htmlImage && !htmlImage.startsWith("data:image/") ? htmlImage : null;
}

export function buildStoryPath(story: { id: string; title: string }): string {
  const slug = slugifyText(story.title) || "story";
  return `/stories/${story.id}-${slug}`;
}

export function extractStoryIdFromParam(storyParam?: string): string | null {
  if (!storyParam) return null;
  if (UUID_REGEX.test(storyParam)) return storyParam;

  const match = storyParam.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:-|$)/i);
  return match?.[1] || null;
}

/**
 * Auto-index: fire-and-forget URL submission to Google Indexing after publish.
 * Silently fails — no user-facing errors.
 */
export function autoIndexUrls(urls: string[]) {
  if (!urls.length) return;
  supabase.functions.invoke("google-indexing", {
    body: { action: "auto_index", urls },
  }).catch(() => { /* silent */ });
}

interface MetaConfig {
  title: string;
  description?: string;
  image?: string;
  url?: string;
  type?: "website" | "article";
  keywords?: string[];
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

const KENYA_BASE_KEYWORDS = [
  "MKU", "UON", "KU", "Moi", "Aga Khan", "Kabarak",
  "MKU pathology", "UON pathology", "Mount Kenya University medicine",
  "clinical pathology Kenya", "past papers Kenya", "MCQs Kenya medical",
  "pathology notes Africa", "medical school notes Kenya",
];

export function buildKeywords(topic: string, extra: string[] = []): string {
  const set = new Set<string>();
  if (topic) set.add(topic.toLowerCase());
  [...KENYA_BASE_KEYWORDS, ...extra].forEach(k => k && set.add(k));
  return Array.from(set).slice(0, 25).join(", ");
}

export function updateMetaTags({ title, description, image, url, type = "website", keywords, jsonLd }: MetaConfig) {
  document.title = title;

  // ✅ Always use www canonical — never fall back to window.location.href
  const canonicalUrl = url || `${SITE_URL}${window.location.pathname}`;
  const keywordContent = keywords && keywords.length ? keywords.join(", ") : buildKeywords(title);

  const tags = [
    { name: "description", content: description },
    { name: "keywords", content: keywordContent },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: image || `${SITE_URL}/og-default.png` },
    { property: "og:url", content: canonicalUrl }, // ✅ always www
    { property: "og:type", content: type },
    { name: "twitter:card", content: "summary_large_image" }, // ✅ added missing twitter:card
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image || `${SITE_URL}/og-default.png` },
  ];

  tags.forEach(tag => {
    if (!tag.content) return;
    const selector = tag.name ? `meta[name="${tag.name}"]` : `meta[property="${tag.property}"]`;
    let element = document.querySelector(selector);
    if (!element) {
      element = document.createElement("meta");
      if (tag.name) element.setAttribute("name", tag.name);
      if (tag.property) element.setAttribute("property", tag.property);
      document.head.appendChild(element);
    }
    element.setAttribute("content", tag.content);
  });

  // ✅ Canonical always uses www
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }
  canonical.setAttribute("href", canonicalUrl);

  // JSON-LD structured data (Article / Quiz / etc.)
  document.querySelectorAll('script[data-managed-ld="1"]').forEach(n => n.remove());
  if (jsonLd) {
    const blocks = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
    blocks.forEach(block => {
      const s = document.createElement("script");
      s.setAttribute("type", "application/ld+json");
      s.setAttribute("data-managed-ld", "1");
      s.textContent = JSON.stringify(block);
      document.head.appendChild(s);
    });
  }
}
