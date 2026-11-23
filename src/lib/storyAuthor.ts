// Author details are stored in tags so story listings do not need to download full story bodies.
export const ABOUT_MAX = 300;
const PREFIX = "about:";
const PHOTO = "photo:";
const UNI = "uni:";
const AUTHOR = "author:";
export const UNIVERSITIES = ["Mount Kenya University (MKU)", "University of Nairobi (UoN)", "Moi University", "Kenyatta University", "JKUAT", "Egerton University", "Maseno University", "University of Eldoret", "Kenya Methodist University", "Other"];

export const cleanAbout = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, ABOUT_MAX);
export const aboutTag = (s: string) => { const t = cleanAbout(s); return t ? PREFIX + encodeURIComponent(t) : ""; };
export const aboutFromTags = (tags?: string[] | null): string => {
  const t = (tags ?? []).find((x) => x.startsWith(PREFIX));
  if (!t) return "";
  try { return cleanAbout(decodeURIComponent(t.slice(PREFIX.length))); } catch { return ""; }
};
export const isVerifiedStory = (tags?: string[] | null) => Boolean(tags?.includes("verified"));
export const authorTag = (name: string, level: string) => {
  const cleanName = name.replace(/\s+/g, " ").trim().slice(0, 80);
  const cleanLevel = level.replace(/\s+/g, " ").trim().slice(0, 24);
  if (!cleanName || /^a medical student$/i.test(cleanName)) return "";
  return AUTHOR + cleanName + "|" + cleanLevel;
};
export const authorFromTags = (tags?: string[] | null): { name: string; level: string } | null => {
  const tag = (tags ?? []).find((value) => value.startsWith(AUTHOR));
  if (!tag) return null;
  const value = tag.slice(AUTHOR.length);
  const separator = value.lastIndexOf("|");
  const name = (separator < 0 ? value : value.slice(0, separator)).trim();
  const level = separator < 0 ? "" : value.slice(separator + 1).trim();
  return name && !/^a medical student$/i.test(name) ? { name, level } : null;
};
export const photoTag = (url: string) => (/^https:\/\//i.test(url) && url.length < 400 ? PHOTO + encodeURIComponent(url) : "");
export const photoFromTags = (tags?: string[] | null): string => {
  const t = (tags ?? []).find((x) => x.startsWith(PHOTO));
  if (!t) return "";
  try { const u = decodeURIComponent(t.slice(PHOTO.length)); return /^https:\/\//i.test(u) ? u : ""; } catch { return ""; }
};
export const cleanUni = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 60);
export const uniTag = (s: string) => { const t = cleanUni(s); return t ? UNI + encodeURIComponent(t) : ""; };
export const uniFromTags = (tags?: string[] | null): string => {
  const t = (tags ?? []).find((x) => x.startsWith(UNI));
  if (!t) return "";
  try { return cleanUni(decodeURIComponent(t.slice(UNI.length))); } catch { return ""; }
};
export const withoutAuthorTags = (tags: string[]) => tags.filter((t) =>
  !t.startsWith(PREFIX) && !t.startsWith(UNI) && !t.startsWith(PHOTO) && !t.startsWith(AUTHOR)
);

/** The byline the writer adds at the top of a story: "By Name · Year 4" or "By Name · Finalist". */
export function authorFromContent(content: string): { name: string; level: string } | null {
  const m = content.match(/^\s*<p><em>By\s+([^<]{1,80}?)\s*(?:·|&middot;|&#183;)\s*([^<]{1,20})<\/em><\/p>/i);
  return m && !/^a (?:medical student|community writer)$/i.test(m[1].trim()) ? { name: m[1].trim(), level: m[2].trim() } : null;
}

/** 1 to 6 are the years of study, 7 a finalist, 8 anyone outside MBChB. */
export const levelLabel = (y: number) => (y === 7 ? "Finalist" : y === 8 ? "Another course" : `Year ${y}`);
