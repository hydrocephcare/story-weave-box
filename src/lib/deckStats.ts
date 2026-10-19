// Small habits for the flashcards: cards done today against a daily goal, the streak of days studied, and starred cards.
const DAY = 86_400_000;
export const DAILY_GOAL = 20;
const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

export function recordReview() {
  const m = read<Record<string, number>>("deck-daily", {});
  const k = dayKey(); m[k] = (m[k] || 0) + 1;
  const keep = Object.keys(m).sort().slice(-60); write("deck-daily", Object.fromEntries(keep.map((x) => [x, m[x]])));
}
export const doneToday = () => read<Record<string, number>>("deck-daily", {})[dayKey()] || 0;
export function streak(): number {
  const m = read<Record<string, number>>("deck-daily", {});
  let n = 0, t = Date.now();
  if (!m[dayKey(t)]) t -= DAY;            // today not started yet does not break the streak
  while (m[dayKey(t)]) { n += 1; t -= DAY; }
  return n;
}
export const starredKeys = () => new Set(read<string[]>("deck-stars", []));
export function toggleStar(key: string): boolean {
  const s = starredKeys(); const on = !s.has(key); if (on) s.add(key); else s.delete(key);
  write("deck-stars", [...s]); return on;
}
