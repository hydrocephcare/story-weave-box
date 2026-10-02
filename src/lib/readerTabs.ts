// The reader's open tabs, shared by every place that opens a file and kept on this device
// so reopening the reader brings back what you were reading.
import { useSyncExternalStore } from "react";
import type { DriveFile } from "@/components/DriveFileViewer";

const KEY = "ompath_reader_tabs";
export const MAX_TABS = 8;

function read(): DriveFile[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v.filter((t) => Array.isArray(t) && typeof t[0] === "string").slice(0, MAX_TABS) : []; } catch { return []; }
}
function write(tabs: DriveFile[]) { try { localStorage.setItem(KEY, JSON.stringify(tabs)); } catch { /* storage blocked */ } }

let tabs: DriveFile[] = read();
const listeners = new Set<() => void>();
const commit = (next: DriveFile[]) => { tabs = next; write(next); listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Open a file as a tab. With `replaceId` it takes over that tab (flipping to the next book) instead of adding a new one. */
export function openTab(file: DriveFile, replaceId?: string | null) {
  if (replaceId && replaceId !== file[0]) {
    const at = tabs.findIndex((t) => t[0] === replaceId);
    if (at >= 0) {
      const without = tabs.filter((t, i) => t[0] !== file[0] || i === at);
      const pos = without.findIndex((t) => t[0] === replaceId);
      const next = [...without]; next[pos] = file;
      commit(next); return;
    }
  }
  if (tabs.some((t) => t[0] === file[0])) return;
  commit([...tabs, file].slice(-MAX_TABS));
}

export function closeTab(id: string) { commit(tabs.filter((t) => t[0] !== id)); }

export function useReaderTabs(): DriveFile[] {
  return useSyncExternalStore(subscribe, () => tabs, () => tabs);
}
