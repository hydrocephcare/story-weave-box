// Which picture a blog may wear on a card, in its hero or on a share image. A picture of a scanned exam page, a phone photo or a screenshot says nothing
// about the topic, so it is never used as the page's picture: the topic's own picture (from the free image library) or a coloured tile is used instead.
import { hueFor } from "@/lib/heroHue";

/** Papers and question banks are not about one subject, so a picture does not describe them. */
export const isPaperTitle = (title: string) =>
  /past paper|\bexam(ination)?s?\b|\bcat\b|\bsupp(lementary)?\b|make-?up|marking scheme|\bmcqs?\b|\bsaqs?\b|\blaqs?\b|questions? (&|and) answers?|question bank|\bquiz\b|assessment|course outline|timetable|\bnotice\b/i.test(title);

/** A picture that is clearly not a picture of the subject: a scanned page, a camera or phone file, a screenshot, a logo. */
export const looksLikeScan = (url: string) => {
  const file = decodeURIComponent(String(url).split("?")[0].split("/").pop() ?? "").toLowerCase();
  return /(^|[-_ ])(page|pg|scan|scanned|img|dsc|screenshot|whatsapp|photo|image|cam-?scanner|doc)[-_ ]?0*\d*(\.|[-_ ]|$)|page-\d+|-p\d{2,3}\.|logo|icon|default|placeholder/.test(file);
};


/** The page's own picture when it has a good one, otherwise "". */
export function usableImage(a: { title?: string | null; og_image_url?: string | null; content?: string | null }): string {
  if (isPaperTitle(String(a.title ?? ""))) return "";
  const inText = [...String(a.content ?? "").matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)].slice(0, 8).map((m) => m[1]);
  for (const url of [a.og_image_url ?? "", ...inText]) {
    if (url && /^https?:\/\//.test(url) && !looksLikeScan(url)) return url;
  }
  return "";
}

/** Two colours for the tile shown when there is no good picture: the subject's own hues, so even a paper looks like it belongs to its unit. */
export function tileColors(a: { title?: string | null; category?: string | null }): [string, string] {
  const year = Number(String(a.category ?? "").match(/Year\s*(\d)/i)?.[1]) || null;
  const [h1, h2] = hueFor(`${String(a.category ?? "").replace(/^Year\s*\d+\s*[:-]?\s*/i, "")} ${a.title ?? ""}`, year);
  return [`hsl(${h1} 58% 30%)`, `hsl(${h2} 62% 20%)`];
}
