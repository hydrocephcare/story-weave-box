// Saved books, recently opened books and reading-path progress, kept on this device.
import { useSyncExternalStore } from "react";

export interface ShelfBook { id: string; name: string; type: number }

const SAVED = "ompath_books_saved";
const RECENT = "ompath_books_recent";
const READ = "ompath_books_read";

function read<T>(key: string, fallback: T): T { try { const v = JSON.parse(localStorage.getItem(key) ?? ""); return v ?? fallback; } catch { return fallback; } }
function write(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ } }

let state = { saved: read<ShelfBook[]>(SAVED, []), recent: read<ShelfBook[]>(RECENT, []), read: new Set<string>(read<string[]>(READ, [])) };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => state;

export function toggleSavedBook(b: ShelfBook) {
  const has = state.saved.some((x) => x.id === b.id);
  state = { ...state, saved: has ? state.saved.filter((x) => x.id !== b.id) : [b, ...state.saved].slice(0, 100) };
  write(SAVED, state.saved); emit();
}

export function addRecentBook(b: ShelfBook) {
  state = { ...state, recent: [b, ...state.recent.filter((x) => x.id !== b.id)].slice(0, 12) };
  write(RECENT, state.recent); emit();
}

export function toggleBookRead(id: string) {
  const next = new Set(state.read);
  if (next.has(id)) next.delete(id); else next.add(id);
  state = { ...state, read: next };
  write(READ, [...next].slice(-500)); emit();
}

export function useBookShelf() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
