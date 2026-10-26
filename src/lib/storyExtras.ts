// Extra things an author can show beside a story, kept in one tag (ext:<json>) so no schema change is needed:
// graduating class, up to three interests, a mentor badge, a one-line tip for juniors and a few links.
export type AuthorExtra = { cls?: string; ints?: string[]; mentor?: boolean; tip?: string; li?: string; ig?: string; x?: string; web?: string };

const EXT = "ext:";
export const INTERESTS = ["Paediatrics", "Surgery", "Internal medicine", "Obstetrics & gynaecology", "Psychiatry", "Public health", "Emergency medicine", "Research", "Radiology", "Dermatology", "Anaesthesia", "Medical education"];
export const MENTOR_TOPICS = "Happy to answer questions from juniors";

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const safeLink = (u: string | undefined, allowed: RegExp) => {
  const v = String(u ?? "").trim();
  if (!/^https:\/\//i.test(v) || v.length > 120) return undefined;
  return allowed.test(host(v)) ? v : undefined;
};

export function cleanExtra(e: AuthorExtra): AuthorExtra {
  const out: AuthorExtra = {};
  const cls = String(e.cls ?? "").replace(/[^0-9]/g, "").slice(0, 4);
  if (/^20[0-9]{2}$/.test(cls)) out.cls = cls;
  const ints = (e.ints ?? []).map((s) => String(s).replace(/\s+/g, " ").trim().slice(0, 28)).filter(Boolean);
  if (ints.length) out.ints = [...new Set(ints)].slice(0, 3);
  if (e.mentor) out.mentor = true;
  const tip = String(e.tip ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
  if (tip) out.tip = tip;
  const li = safeLink(e.li, /(^|\.)linkedin\.com$/); if (li) out.li = li;
  const ig = safeLink(e.ig, /(^|\.)instagram\.com$/); if (ig) out.ig = ig;
  const x = safeLink(e.x, /(^|\.)(x|twitter)\.com$/); if (x) out.x = x;
  const web = safeLink(e.web, /\./); if (web) out.web = web;
  return out;
}

export const extraTag = (e: AuthorExtra): string => {
  const c = cleanExtra(e);
  if (!Object.keys(c).length) return "";
  const t = EXT + encodeURIComponent(JSON.stringify(c));
  return t.length <= 900 ? t : "";
};

export const extraFromTags = (tags?: string[] | null): AuthorExtra => {
  const t = (tags ?? []).find((x) => x.startsWith(EXT));
  if (!t) return {};
  try { return cleanExtra(JSON.parse(decodeURIComponent(t.slice(EXT.length)))); } catch { return {}; }
};

export const withoutExtraTag = (tags: string[]) => tags.filter((t) => !t.startsWith(EXT));

/** The author's private-looking tag is only used to find their other stories; it is never shown. */
export const ownerOf = (tags?: string[] | null) => (tags ?? []).find((t) => /^owner-/.test(t)) ?? "";

/** Saved stories live in this browser only. */
const KEY = "ompath_saved_stories";
export const readSaved = (): string[] => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; } };
export const toggleSaved = (id: string): boolean => {
  const cur = readSaved(); const on = !cur.includes(id);
  try { localStorage.setItem(KEY, JSON.stringify(on ? [id, ...cur].slice(0, 200) : cur.filter((x) => x !== id))); } catch { /* storage blocked */ }
  return on;
};
