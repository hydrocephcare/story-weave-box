// Pages a student saved for later (topics, and the notes saved with the bookmark), kept per account on this device and shown together at /saved.
import { savedNotes, toggleSaved as toggleSavedNote } from "@/lib/savedNotes";

export interface SavedTopic { s: string; n: string; at: number }
const key = (uid: string | null | undefined) => `ompath_saved_topics_${uid ?? "guest"}`;

export function savedTopics(uid: string | null | undefined): SavedTopic[] {
  try { const v = JSON.parse(localStorage.getItem(key(uid)) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
export const isTopicSaved = (uid: string | null | undefined, slug: string) => savedTopics(uid).some((t) => t.s === slug);

/** Saves or un-saves a topic page; returns whether it is saved now. */
export function toggleTopicSaved(uid: string | null | undefined, slug: string, name: string): boolean {
  const list = savedTopics(uid);
  const has = list.some((t) => t.s === slug);
  const next = has ? list.filter((t) => t.s !== slug) : [{ s: slug, n: name.slice(0, 80), at: Date.now() }, ...list].slice(0, 100);
  try { localStorage.setItem(key(uid), JSON.stringify(next)); } catch { /* storage blocked */ }
  return !has;
}

export { savedNotes, toggleSavedNote };
