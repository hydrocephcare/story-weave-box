// The "About the author" note of a story is kept in the story's tags (about:<text>) so no schema change is needed.
// A story written by a signed-in, confirmed account also carries the "verified" tag.
export const ABOUT_MAX = 300;
const PREFIX = "about:";

export const cleanAbout = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, ABOUT_MAX);
export const aboutTag = (s: string) => { const t = cleanAbout(s); return t ? PREFIX + encodeURIComponent(t) : ""; };
export const aboutFromTags = (tags?: string[] | null): string => {
  const t = (tags ?? []).find((x) => x.startsWith(PREFIX));
  if (!t) return "";
  try { return cleanAbout(decodeURIComponent(t.slice(PREFIX.length))); } catch { return ""; }
};
export const isVerifiedStory = (tags?: string[] | null) => Boolean(tags?.includes("verified"));
export const withoutAuthorTags = (tags: string[]) => tags.filter((t) => !t.startsWith(PREFIX));

/** The byline the writer adds at the top of a story: "By Name · Year 4" or "By Name · Finalist". */
export function authorFromContent(content: string): { name: string; level: string } | null {
  const m = content.match(/^\s*<p><em>By\s+([^<]{1,80}?)\s*(?:·|&middot;|&#183;)\s*([^<]{1,20})<\/em><\/p>/i);
  return m ? { name: m[1].trim(), level: m[2].trim() } : null;
}
