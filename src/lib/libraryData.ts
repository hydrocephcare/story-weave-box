// One shared, cached loader for the library data files, so moving between a year page, a folder and a
// search never downloads the same JSON twice.
import type { DriveFile } from "@/components/DriveFileViewer";

export interface LibraryNode { n: string; s: string; d?: LibraryNode[]; f?: DriveFile[] }
export interface LibraryData { updated: string; d: LibraryNode[] }

const cache = new Map<string, Promise<unknown>>();

function load<T>(file: string): Promise<T> {
  let p = cache.get(file) as Promise<T> | undefined;
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/${file}`).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<T>; });
    p.catch(() => cache.delete(file)); // allow a retry after a failed load
    cache.set(file, p);
  }
  return p;
}

export const loadLibrary = (dataFile: string) => load<LibraryData>(dataFile);

/** Ids of files that were found missing or unshared on Drive (see scripts/library/check-links.mjs). */
export const loadBrokenLinks = (): Promise<Set<string>> =>
  load<{ broken: string[] }>("broken-links.json").then((d) => new Set(d.broken)).catch(() => new Set<string>());

/** Start fetching a library in the background (e.g. when the pointer is over its link). */
export const preloadLibrary = (dataFile: string) => { void loadLibrary(dataFile).catch(() => undefined); };
