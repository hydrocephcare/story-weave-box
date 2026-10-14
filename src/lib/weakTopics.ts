// Questions a student got wrong in their weekly assessment, brought back on a spaced schedule (1, 3, 7, then 14 days) until they say they know them.
// Kept on this device per account; never shared.
export interface Weak { q: string; why: string; stage: number; due: number; part?: "asked" | "read" }
export const GAPS_DAYS = [1, 3, 7, 14];
const keyFor = (uid: string | null | undefined) => `ompath_weak_${uid ?? "guest"}`;

export function readWeak(uid: string | null | undefined): Weak[] {
  try { const v = JSON.parse(localStorage.getItem(keyFor(uid)) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
const write = (uid: string | null | undefined, items: Weak[]) => { try { localStorage.setItem(keyFor(uid), JSON.stringify(items.slice(0, 60))); } catch { /* storage blocked */ } };

export function addWeak(uid: string | null | undefined, w: { q: string; why: string; part?: "asked" | "read" }) {
  const all = readWeak(uid);
  if (all.some((x) => x.q === w.q)) return;
  write(uid, [{ ...w, stage: 0, due: Date.now() + GAPS_DAYS[0] * 86_400_000 }, ...all]);
}
export const dueNow = (uid: string | null | undefined) => readWeak(uid).filter((w) => w.due <= Date.now());

/** "I know it now" moves the question to a longer gap, and after the last gap it is dropped; "Still unsure" starts it again. */
export function review(uid: string | null | undefined, q: string, knew: boolean) {
  const all = readWeak(uid);
  const next: Weak[] = [];
  for (const w of all) {
    if (w.q !== q) { next.push(w); continue; }
    if (!knew) { next.push({ ...w, stage: 0, due: Date.now() + GAPS_DAYS[0] * 86_400_000 }); continue; }
    if (w.stage + 1 >= GAPS_DAYS.length) continue; // learned
    next.push({ ...w, stage: w.stage + 1, due: Date.now() + GAPS_DAYS[w.stage + 1] * 86_400_000 });
  }
  write(uid, next);
}
export const clearWeak = (uid: string | null | undefined) => { try { localStorage.removeItem(keyFor(uid)); } catch { /* ignore */ } };
