// Where to go back to after following a link out of a note (for example from Asthma to the asthma drugs),
// kept for this browser tab only. The note page restores your scroll position when you come back.
import { useSyncExternalStore } from "react";

const KEY = "ompath_note_return";

export interface NoteReturn { path: string; title: string; y: number }

function read(): NoteReturn | null {
  try { const v = JSON.parse(sessionStorage.getItem(KEY) ?? "null"); return v && typeof v.path === "string" ? v : null; } catch { return null; }
}

let current: NoteReturn | null = read();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getNoteReturn = () => current;

export function setNoteReturn(r: NoteReturn) {
  current = r;
  try { sessionStorage.setItem(KEY, JSON.stringify(r)); } catch { /* storage blocked */ }
  emit();
}

export function clearNoteReturn() {
  if (!current) return;
  current = null;
  try { sessionStorage.removeItem(KEY); } catch { /* storage blocked */ }
  emit();
}

export function useNoteReturn(): NoteReturn | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => current, () => current);
}
