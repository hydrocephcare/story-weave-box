// The live notes folder (see api/drive-notes.js). Loaded once per visit and shared by the page, the search and Ompath AI.
import type { DriveFile, DriveKind } from "@/components/DriveFileViewer";

export interface DriveNode { id: string; name: string; folders: DriveNode[]; files: { id: string; name: string; kind: DriveKind; modified: string }[] }
export type DriveNotes = { ok: true; updated: string; partial: boolean; tree: DriveNode } | { ok: false; reason: "private" | "missing" | "unavailable"; message: string };

const KEY = "ompath_drive_notes_v1";
const TTL = 5 * 60 * 1000;
let inflight: Promise<DriveNotes> | null = null;
let lastFailure: { at: number; data: DriveNotes } | null = null;

export function loadDriveNotes(force = false): Promise<DriveNotes> {
  if (!force) {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) { const v = JSON.parse(raw) as { at: number; data: DriveNotes }; if (Date.now() - v.at < TTL && v.data.ok) return Promise.resolve(v.data); }
    } catch { /* no cache */ }
  }
  if (!force && lastFailure && Date.now() - lastFailure.at < 60_000) return Promise.resolve(lastFailure.data); // do not hammer a folder that is not shared yet
  if (!inflight) {
    inflight = fetch("/api/drive-notes").then((r) => r.json() as Promise<DriveNotes>)
      .then((data) => { try { if (data.ok) { lastFailure = null; sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), data })); } else lastFailure = { at: Date.now(), data }; } catch { /* storage full */ } return data; })
      .catch((e): DriveNotes => ({ ok: false, reason: "unavailable", message: String(e) }))
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** How the weekly AI sort filed a note (public/data/drive-notes-index.json, made by scripts/categorize-drive-notes.mjs). */
export interface DriveCat { year: number | null; unit: string | null; type: string; title: string; summary: string; firstSeen: string; sorted: boolean }
export type DriveIndex = Record<string, DriveCat>;

let indexPromise: Promise<DriveIndex> | null = null;
export function loadDriveIndex(): Promise<DriveIndex> {
  indexPromise ??= fetch(`${import.meta.env.BASE_URL}data/drive-notes-index.json`)
    .then((r) => (r.ok ? r.json() : { files: {} }))
    .then((j) => (j?.files ?? {}) as DriveIndex)
    .catch(() => ({} as DriveIndex));
  return indexPromise;
}

export interface DriveRow { file: DriveFile; where: string[]; modified: string; cat?: DriveCat }
/**
 * Every file with where it belongs. A file the AI has sorted sits under its Year and Unit; one added since the last weekly sort has no entry yet
 * and keeps its Drive folder path; one the AI could not place stays in its folder too.
 */
export function flattenDrive(node: DriveNode, path: string[] = [], index: DriveIndex = {}): DriveRow[] {
  return [
    ...node.files.map((f) => {
      const cat = index[f.id];
      return { file: [f.id, f.name, f.kind] as DriveFile, where: cat?.sorted && cat.year && cat.unit ? [`Year ${cat.year}`, cat.unit] : path, modified: f.modified, cat };
    }),
    ...node.folders.flatMap((c) => flattenDrive(c, [...path, c.name], index)),
  ];
}
export const countFiles = (n: DriveNode): number => n.files.length + n.folders.reduce((s, f) => s + countFiles(f), 0);
