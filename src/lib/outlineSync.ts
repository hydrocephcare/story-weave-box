// Course outlines that the admin drops in (src/pages/AdminOutlineSync.tsx). The site reads them and tells every note, blog and topic
// where it sits: "Year 4 · Semester 2 · Week 5 · Pancreatitis · Dr X". Stored in app_settings under "outline_sync".
import { useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/store";

export interface OutlineRow { id: string; week: string; topic: string; lecturer: string; detail: string }
export interface OutlineDoc { id: string; year: number; semester: string; unit: string; startDate: string; rows: OutlineRow[] }
export interface OutlineMatch { doc: OutlineDoc; row: OutlineRow; score: number }

const KEY = "outline_sync";
let cache: OutlineDoc[] | null = null;
let inflight: Promise<OutlineDoc[]> | null = null;
const listeners = new Set<() => void>();

export async function loadOutlineDocs(force = false): Promise<OutlineDoc[]> {
  if (cache && !force) return cache;
  if (inflight && !force) return inflight;
  inflight = getSetting(KEY).then((t) => {
    try { const j = t ? JSON.parse(t) : {}; cache = Array.isArray(j.docs) ? j.docs : []; } catch { cache = []; }
    return cache as OutlineDoc[];
  }).catch(() => (cache = [])).finally(() => { inflight = null; listeners.forEach((l) => l()); });
  return inflight;
}

export async function saveOutlineDocs(docs: OutlineDoc[]): Promise<void> {
  await saveSetting(KEY, JSON.stringify({ version: 1, updated: new Date().toISOString(), docs }));
  cache = docs;
  listeners.forEach((l) => l());
}

export function useOutlineDocs(): OutlineDoc[] {
  const [docs, setDocs] = useState<OutlineDoc[]>(cache ?? []);
  useEffect(() => {
    let on = true;
    const sync = () => on && setDocs(cache ?? []);
    listeners.add(sync);
    void loadOutlineDocs().then(sync);
    return () => { on = false; listeners.delete(sync); };
  }, []);
  return docs;
}

const STOP = new Set(["and", "of", "the", "in", "with", "for", "to", "on", "a", "an", "at", "by", "its", "is", "are", "or", "from", "as", "part", "introduction", "intro", "overview", "lecture", "notes", "note", "year", "unit", "revised", "past", "paper", "questions", "answers", "exam", "mcqs", "cat"]);
const norm = (w: string) => w.replace(/aem/g, "em").replace(/oe/g, "e").replace(/ae/g, "e").replace(/ies$/, "y").replace(/(?<=[a-z]{4})s$/, "").replace(/ic$|al$/, "");

/** The words of a title that carry meaning: lowercase, plain spelling, no filler. */
export function tokensOf(text: string): string[] {
  return String(text ?? "").toLowerCase().replace(/&/g, " and ").split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)).map(norm);
}

/** How well a page title covers an outline topic (0 to 1): every meaningful word of the topic found in the title scores 1. */
export function coverage(topic: string, title: string): number {
  const t = tokensOf(topic); if (!t.length) return 0;
  const have = new Set(tokensOf(title));
  let hit = 0; for (const w of t) if (have.has(w) || [...have].some((h) => h.length >= 5 && w.length >= 5 && (h.startsWith(w) || w.startsWith(h)))) hit++;
  return hit / t.length;
}

/** The outline row that a page belongs to, or null when nothing fits well enough to say so. */
export function matchOutline(docs: OutlineDoc[], page: { title: string; year?: number | null; unit?: string }): OutlineMatch | null {
  let best: OutlineMatch | null = null;
  for (const doc of docs) for (const row of doc.rows) {
    const c = coverage(row.topic, page.title);
    const back = coverage(page.title, row.topic); // the page's own words found in the topic: guards against one-word topics matching everything
    if (c < 0.74 || back < 0.34) continue;
    let score = c * 0.7 + back * 0.3;
    if (page.year && doc.year === page.year) score += 0.12;
    if (page.unit && doc.unit && coverage(doc.unit, page.unit) > 0.5) score += 0.12;
    if (!best || score > best.score) best = { doc, row, score };
  }
  return best && best.score >= 0.78 ? best : null;
}

/** "Week 5" or "5" or "Wk 3-4" -> [3, 4] */
export function weekRange(week: string): [number, number] | null {
  const m = String(week).match(/(\d{1,2})(?:\s*[-–to]+\s*(\d{1,2}))?/i);
  if (!m) return null;
  const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
  return [Math.min(a, b), Math.max(a, b)];
}

/** Which teaching week a date is in, counting from the semester's start date (week 1 is the first seven days). */
export function currentWeek(startDate: string, now = new Date()): number | null {
  const t = Date.parse(startDate);
  if (!Number.isFinite(t)) return null;
  const w = Math.floor((now.getTime() - t) / (7 * 86_400_000)) + 1;
  return w >= 1 && w <= 30 ? w : null;
}

export const semesterLabel = (s: string) => (/^\d+$/.test(s) ? `Semester ${s}` : s || "Semester");
export const outlineLine = (m: OutlineMatch) => [`Year ${m.doc.year}`, semesterLabel(m.doc.semester), m.row.week ? (/^\d/.test(m.row.week) ? `Week ${m.row.week}` : m.row.week) : "", m.doc.unit, m.row.lecturer].filter(Boolean).join(" · ");
