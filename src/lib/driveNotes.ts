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

export interface DriveRow { file: DriveFile; where: string[]; modified: string }
/** Every file with the folders it sits in (the notes folder itself is not part of the path). */
export function flattenDrive(node: DriveNode, path: string[] = []): DriveRow[] {
  return [
    ...node.files.map((f) => ({ file: [f.id, f.name, f.kind] as DriveFile, where: path, modified: f.modified })),
    ...node.folders.flatMap((c) => flattenDrive(c, [...path, c.name])),
  ];
}
export const countFiles = (n: DriveNode): number => n.files.length + n.folders.reduce((s, f) => s + countFiles(f), 0);
