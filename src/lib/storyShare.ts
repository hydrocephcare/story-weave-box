import { SITE_URL } from "@/lib/seo";

export const STORY_SLUGS = ["experience", "advice", "first-year-life", "clinical-rotations", "exams-study", "reflection", "campus-fun"];

/** The share picture for a story's topic. It is also used as the card picture until a story has its own. */
export function storyThumb(category: string): string {
  const slug = category.toLowerCase().replace(/&/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
  return `${SITE_URL}/og/stories/${STORY_SLUGS.includes(slug) ? slug : "other"}.png`;
}
export const isGeneratedThumb = (url?: string | null) => Boolean(url && url.startsWith(`${SITE_URL}/og/stories/`));

export const INVITE_URL = `${SITE_URL}/stories?write=1`;
export const INVITE_TEXT = `Your medical school story could be the one a first-year needs to read tonight. Share it on Ompath Study: it takes two minutes, and your name can stay private.\n${INVITE_URL}`;

export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/** Opens the phone's share sheet when there is one, otherwise WhatsApp. */
export async function shareOut(text: string, url: string, title: string) {
  try {
    if (typeof navigator !== "undefined" && "share" in navigator) { await navigator.share({ title, text, url }); return; }
  } catch { return; /* closed the sheet */ }
  window.open(whatsappLink(`${text}\n${url}`), "_blank", "noopener");
}
