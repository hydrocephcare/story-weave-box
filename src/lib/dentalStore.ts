// Small per-device memory for the dental section: saved papers, finished papers, and the got-it / missed-it marks. Everything is wrapped so private mode never breaks a page.
export const SAVED = "dental_saved";
export const DONE = "dental_done";
const STUDY = "dental_study_";

const read = <T,>(k: string, fallback: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); window.dispatchEvent(new Event("dental:store")); } catch { /* private mode */ } };

export const getList = (k: string): string[] => read<string[]>(k, []);
export const inList = (k: string, slug: string) => getList(k).includes(slug);
/** Adds or removes a slug and returns whether it is in the list afterwards. */
export function toggleList(k: string, slug: string): boolean {
  const l = getList(k); const has = l.includes(slug);
  write(k, has ? l.filter((x) => x !== slug) : [...l, slug]);
  return !has;
}

export type Rating = "got" | "missed";
export const getRatings = (slug: string): Record<string, Rating> => read<Record<string, Rating>>(STUDY + slug, {});
export const setRatings = (slug: string, r: Record<string, Rating | undefined>) => write(STUDY + slug, r);

/** Every paper the student has marked anything on: slug, how many got it and how many missed it, and the keys they missed. */
export function studyStats(): { slug: string; got: number; missed: number; missedKeys: string[] }[] {
  const out: { slug: string; got: number; missed: number; missedKeys: string[] }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i); if (!k || !k.startsWith(STUDY)) continue;
      const r = read<Record<string, Rating>>(k, {}); const e = Object.entries(r).filter(([, v]) => v);
      if (e.length) out.push({ slug: k.slice(STUDY.length), got: e.filter(([, v]) => v === "got").length, missed: e.filter(([, v]) => v === "missed").length, missedKeys: e.filter(([, v]) => v === "missed").map(([kk]) => kk) });
    }
  } catch { /* private mode */ }
  return out;
}
