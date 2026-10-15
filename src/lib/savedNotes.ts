// Notes a student saved for later (the bookmark button), kept per account on this device. They show as a shelf at the top of /notes.
const key = (uid: string | null | undefined) => `ompath_saved_notes_${uid ?? "guest"}`;
export const savedNotes = (uid: string | null | undefined): string[] => { try { const v = JSON.parse(localStorage.getItem(key(uid)) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
export const isSaved = (uid: string | null | undefined, slug: string) => savedNotes(uid).includes(slug);
export function toggleSaved(uid: string | null | undefined, slug: string): boolean {
  const list = savedNotes(uid);
  const next = list.includes(slug) ? list.filter((s) => s !== slug) : [slug, ...list].slice(0, 60);
  try { localStorage.setItem(key(uid), JSON.stringify(next)); } catch { /* storage blocked */ }
  return next.includes(slug);
}
