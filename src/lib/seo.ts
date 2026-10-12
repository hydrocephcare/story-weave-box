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

/** For question papers with no prose: how many multiple-choice questions there are, and whether answers are given. */
export function examSummary(content: string | undefined | null): string {
  const c = content || "";
  const n = (c.match(/^\s*(?:[-*]\s*)?\(?A[.)]\s/gm) || []).length;
  if (n < 5) return "";
  const answers = (c.match(/^\W*(?:\*\*)?\s*(?:correct )?answer\b/gim) || []).length >= n / 2;
  return `${n} multiple-choice questions${answers ? " with answers" : ""} for exam practice.`;
}

/** A short, readable summary for a note's header card: the stored description if it is clean prose, otherwise the first real sentences of the note (never headings, page numbers, "Section A" or table rows). */
export function readableSummary(description: string | undefined | null, content: string | undefined | null, maxLength = 140): string {
  const messy = (t: string) => /#{2,}|\s[-–—]\s[-–—]\s|^\d+[.)]\s|\*\*|\|/.test(t);
  const d = stripRichText(description || "");
  if (d.length >= 40 && !messy(description || "")) return d.slice(0, maxLength);
  const exam = examSummary(content);
  if (exam) return exam; // a question paper: say what it is, not whichever line comes first
  // the first complete sentence of real prose (a list item counts, a heading, table row, label ending in a colon or printed header does not)
  const lines = (content || "").replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim().replace(/^([-*•]|\d+[.)])\s+/, "");
    if (!t || /^(#|!\[|\||-{3,}|>|```)/.test(t)) continue;
    let plain = stripRichText(t);
    if (plain.length < 50 || !/[.!?]$/.test(plain)) continue;
    if (/^(school of|department of|university of|section [a-d]\b|instructions|answer all|time:|date:|note:|explanation|rationale|remember|clinical significance|answer|correct answer|question|q\d+|\d+[.)]|attempt all)/i.test(plain)) continue;
    if (/\?$/.test(plain) || /source pages?|transcription|original paper|scanned|scan\b/i.test(plain)) continue; // a question, or scan boilerplate
    if (plain === plain.toUpperCase()) continue; // a printed heading
    if (plain.length < 90) { const nxt = stripRichText((lines[i + 1] || "").trim().replace(/^([-*•]|\d+[.)])\s+/, "")); if (nxt && /^[A-Z]/.test(nxt) && !/^#/.test((lines[i + 1] || "").trim())) plain = `${plain} ${nxt}`; }
    return plain.slice(0, maxLength);
  }
  return d && !messy(description || "") ? d.slice(0, maxLength) : examSummary(content);
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

const BASE_KEYWORDS = [
  "medical school notes", "free MCQs with answers", "past papers", "flashcards", "MBBS", "MBChB", "medical students worldwide",
];

export function buildKeywords(topic: string, extra: string[] = []): string {
  const set = new Set<string>();
  if (topic) set.add(topic.toLowerCase());
  [...BASE_KEYWORDS, ...extra].forEach(k => k && set.add(k));
  return Array.from(set).slice(0, 25).join(", ");
}

export function updateMetaTags({ title, description, image, url, type = "website", keywords, jsonLd }: MetaConfig) {
  document.title = title;

  // ✅ Always use www canonical — never fall back to window.location.href
  const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
  const canonicalUrl = url || `${SITE_URL}${normalizedPath}`;
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
