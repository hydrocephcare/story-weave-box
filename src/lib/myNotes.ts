// A student's own notes on a page (a note, a topic or a blog), kept per account on this device. They show under the page and on /saved.
export interface MyNote { t: string; text: string; at: number }
const key = (uid: string | null | undefined) => `ompath_mynotes_${uid ?? "guest"}`;

export function allMyNotes(uid: string | null | undefined): Record<string, MyNote> {
  try { const v = JSON.parse(localStorage.getItem(key(uid)) ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
export const myNoteFor = (uid: string | null | undefined, path: string): MyNote | null => allMyNotes(uid)[path] ?? null;

export function saveMyNote(uid: string | null | undefined, path: string, title: string, text: string) {
  try {
    const all = allMyNotes(uid);
    if (!text.trim()) delete all[path]; else all[path] = { t: title.slice(0, 120), text: text.slice(0, 5000), at: Date.now() };
    localStorage.setItem(key(uid), JSON.stringify(all));
  } catch { /* storage blocked */ }
}
