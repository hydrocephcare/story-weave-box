// Where a student is in their notes: the place they stopped reading, notes due for a second look (3, 7 then 21 days after finishing), and an exam date
// that turns into "read this many topics a day". Everything stays on this device, per account.
export interface Place { slug: string; title: string; progress: number; at: number }
export interface Review { slug: string; title: string; stage: number; due: number }
export const REVIEW_DAYS = [3, 7, 21];

const k = (what: string, uid: string | null | undefined) => `ompath_${what}_${uid ?? "guest"}`;
const read = <T,>(key: string, fallback: T): T => { try { const v = JSON.parse(localStorage.getItem(key) ?? "null"); return v ?? fallback; } catch { return fallback; } };
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ } };

/** Remembers how far down a note the student got (kept for the 12 most recent notes). */
export function savePlace(uid: string | null | undefined, p: { slug: string; title: string; progress: number }) {
  if (p.progress < 3) return;
  const list = read<Place[]>(k("places", uid), []).filter((x) => x.slug !== p.slug);
  write(k("places", uid), [{ ...p, at: Date.now() }, ...list].slice(0, 12));
}
/** Notes started but not finished, newest first. */
export const unfinished = (uid: string | null | undefined): Place[] => read<Place[]>(k("places", uid), []).filter((p) => p.progress >= 5 && p.progress < 92).slice(0, 4);

export function scheduleReview(uid: string | null | undefined, n: { slug: string; title: string }) {
  const list = read<Review[]>(k("reviews", uid), []);
  if (list.some((r) => r.slug === n.slug)) return;
  write(k("reviews", uid), [...list, { ...n, stage: 0, due: Date.now() + REVIEW_DAYS[0] * 86_400_000 }]);
}
export const dueReviews = (uid: string | null | undefined): Review[] => read<Review[]>(k("reviews", uid), []).filter((r) => r.due <= Date.now());
/** "Reviewed": the next gap is longer; after the last gap the note is done with. */
export function completeReview(uid: string | null | undefined, slug: string) {
  const next: Review[] = [];
  for (const r of read<Review[]>(k("reviews", uid), [])) {
    if (r.slug !== slug) { next.push(r); continue; }
    if (r.stage + 1 >= REVIEW_DAYS.length) continue;
    next.push({ ...r, stage: r.stage + 1, due: Date.now() + REVIEW_DAYS[r.stage + 1] * 86_400_000 });
  }
  write(k("reviews", uid), next);
}

export const getExamDate = (uid: string | null | undefined): string => read<string>(k("exam_date", uid), "");
export const setExamDate = (uid: string | null | undefined, d: string) => write(k("exam_date", uid), d);
/** How many topics a day are needed to finish the ones left before the exam (at least 1). Null when there is no date or it has passed. */
export function perDay(left: number, examDate: string): number | null {
  const days = Math.ceil((new Date(examDate).getTime() - Date.now()) / 86_400_000);
  if (!examDate || !Number.isFinite(days) || days <= 0) return null;
  return Math.max(1, Math.ceil(left / days));
}
export const daysUntil = (examDate: string): number | null => { const d = Math.ceil((new Date(examDate).getTime() - Date.now()) / 86_400_000); return examDate && Number.isFinite(d) && d > 0 ? d : null; };
