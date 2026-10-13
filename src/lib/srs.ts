// A small spaced-repetition deck kept on this device: cards made from pages, reviewed on a schedule that stretches as you remember them.
// Nothing here needs an account. (SM-2: ease and interval grow when you get a card right, reset when you do not.)
import { useSyncExternalStore } from "react";

export interface SrsCard { id: string; q: string; a: string; title: string; path: string; due: number; interval: number; ease: number; reps: number; created: number }
export type Grade = 0 | 1 | 2 | 3; // again, hard, good, easy

const KEY = "ompath_srs_v1";
const STREAK = "ompath_srs_streak";
const DAY = 86_400_000;
let cards: SrsCard[] = read();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function read(): SrsCard[] { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
function write() { try { localStorage.setItem(KEY, JSON.stringify(cards.slice(-1500))); } catch { /* storage full or blocked */ } emit(); }
const idOf = (q: string, path: string) => `${path}::${q.toLowerCase().replace(/\W+/g, " ").slice(0, 90)}`;

export const srs = {
  all: () => cards,
  add(items: { q: string; a: string }[], from: { title: string; path: string }): number {
    let added = 0;
    for (const it of items) {
      const id = idOf(it.q, from.path);
      if (cards.some((c) => c.id === id)) continue;
      cards = [...cards, { id, q: it.q, a: it.a, title: from.title, path: from.path, due: Date.now(), interval: 0, ease: 2.5, reps: 0, created: Date.now() }];
      added++;
    }
    if (added) write();
    return added;
  },
  due: (now = Date.now()) => cards.filter((c) => c.due <= now).sort((a, b) => a.due - b.due),
  grade(id: string, g: Grade) {
    cards = cards.map((c) => {
      if (c.id !== id) return c;
      let { interval, ease, reps } = c;
      if (g === 0) { reps = 0; interval = 0; ease = Math.max(1.3, ease - 0.2); }
      else {
        reps += 1;
        interval = reps === 1 ? (g === 1 ? 1 : g === 3 ? 4 : 2) : Math.round(Math.max(1, interval) * ease * (g === 1 ? 0.8 : g === 3 ? 1.3 : 1));
        ease = Math.max(1.3, ease + (g === 3 ? 0.15 : g === 1 ? -0.15 : 0));
      }
      return { ...c, interval, ease, reps, due: g === 0 ? Date.now() + 10 * 60_000 : Date.now() + interval * DAY };
    });
    write();
    streak.touch();
  },
  remove(id: string) { cards = cards.filter((c) => c.id !== id); write(); },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const streak = {
  get(): { n: number; today: boolean } {
    try {
      const v = JSON.parse(localStorage.getItem(STREAK) ?? "null") as { last: string; n: number } | null;
      if (!v) return { n: 0, today: false };
      if (v.last === dayKey()) return { n: v.n, today: true };
      const y = new Date(Date.now() - DAY);
      return { n: v.last === dayKey(y) ? v.n : 0, today: false };
    } catch { return { n: 0, today: false }; }
  },
  touch() {
    try {
      const cur = streak.get();
      if (cur.today) return;
      localStorage.setItem(STREAK, JSON.stringify({ last: dayKey(), n: cur.n + 1 }));
      emit();
    } catch { /* ignore */ }
  },
};

export function useSrs() {
  return useSyncExternalStore(srs.subscribe, () => cards, () => cards);
}
