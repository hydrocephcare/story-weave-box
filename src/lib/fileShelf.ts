// Per-device "saved" and "recently opened" library files, kept in localStorage.
import { useSyncExternalStore } from "react";
import type { DriveFile, DriveKind } from "@/components/DriveFileViewer";

export interface ShelfItem { id: string; name: string; kind: DriveKind; where?: string; at: number }

const SAVED_KEY = "ompath_saved_files";
const RECENT_KEY = "ompath_recent_files";
const RECENT_MAX = 12;
const SAVED_MAX = 200;

function read(key: string): ShelfItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((i) => i && typeof i.id === "string") : [];
  } catch { return []; }
}

let state = { saved: read(SAVED_KEY), recent: read(RECENT_KEY) };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function persist() {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(state.saved)); localStorage.setItem(RECENT_KEY, JSON.stringify(state.recent)); } catch { /* storage blocked */ }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === SAVED_KEY || e.key === RECENT_KEY) { state = { saved: read(SAVED_KEY), recent: read(RECENT_KEY) }; emit(); }
  });
  // the account's copy arrives after sign-in, and is cleared when someone signs out
  for (const ev of ["ompath:state-synced", "ompath:signed-out"]) window.addEventListener(ev, () => { state = { saved: read(SAVED_KEY), recent: read(RECENT_KEY) }; emit(); });
}

const toItem = (file: DriveFile, where?: string): ShelfItem => ({ id: file[0], name: file[1], kind: file[2], where, at: Date.now() });

export function toggleSaved(file: DriveFile, where?: string) {
  const has = state.saved.some((i) => i.id === file[0]);
  state = { ...state, saved: has ? state.saved.filter((i) => i.id !== file[0]) : [toItem(file, where), ...state.saved].slice(0, SAVED_MAX) };
  persist(); emit();
}

export function addRecent(file: DriveFile, where?: string) {
  if (state.recent[0]?.id === file[0]) return;
  state = { ...state, recent: [toItem(file, where), ...state.recent.filter((i) => i.id !== file[0])].slice(0, RECENT_MAX) };
  persist(); emit();
}

export function clearRecent() { state = { ...state, recent: [] }; persist(); emit(); }

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => state;

export function useFileShelf() {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { saved: s.saved, recent: s.recent, isSaved: (id: string) => s.saved.some((i) => i.id === id) };
}

export const shelfToFile = (i: ShelfItem): DriveFile => [i.id, i.name, i.kind];
