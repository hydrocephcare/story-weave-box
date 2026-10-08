// What a student has practised and where they slip. Every answered quiz question and every "Got it / Missed it" in the spot drill leaves one
// small record on the device; the Review panel turns the records into weak topics and next steps. It is all local arithmetic, so it costs no credits.
export type Source = "mcq" | "spot" | "essay";
export interface PracticeEvent { t: number; kind: Source; topic: string; ok: boolean }

const KEY = "ompath_review_v1";
const MAX = 600;
const DAY = 86_400_000;

export function readEvents(): PracticeEvent[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function logEvents(events: Omit<PracticeEvent, "t">[]) {
  if (!events.length) return;
  try { localStorage.setItem(KEY, JSON.stringify([...readEvents(), ...events.map((e) => ({ ...e, t: Date.now() }))].slice(-MAX))); } catch { /* storage full */ }
  window.dispatchEvent(new Event("ompath:review"));
}
export const clearEvents = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } window.dispatchEvent(new Event("ompath:review")); };

export interface TopicStat { topic: string; attempts: number; correct: number; missed: number; accuracy: number; lastAt: number }

/** Per topic: how many tried, how many right, and how recently. Topics are named the way the question banks name them. */
export function topicStats(events: PracticeEvent[] = readEvents()): TopicStat[] {
  const m = new Map<string, TopicStat>();
  for (const e of events) {
    const s = m.get(e.topic) ?? { topic: e.topic, attempts: 0, correct: 0, missed: 0, accuracy: 0, lastAt: 0 };
    s.attempts++; if (e.ok) s.correct++; else s.missed++;
    s.lastAt = Math.max(s.lastAt, e.t);
    m.set(e.topic, s);
  }
  return [...m.values()].map((s) => ({ ...s, accuracy: s.attempts ? s.correct / s.attempts : 0 }));
}

/** The topics to work on: missed more than once or under 60% right, worst and most recent first. */
export function weakTopics(limit = 6, events: PracticeEvent[] = readEvents()): TopicStat[] {
  return topicStats(events).filter((s) => s.missed >= 2 || (s.attempts >= 3 && s.accuracy < 0.6)).sort((a, b) => a.accuracy - b.accuracy || b.missed - a.missed || b.lastAt - a.lastAt).slice(0, limit);
}
export function strongTopics(limit = 4, events: PracticeEvent[] = readEvents()): TopicStat[] {
  return topicStats(events).filter((s) => s.attempts >= 5 && s.accuracy >= 0.8).sort((a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts).slice(0, limit);
}

export function activity(events: PracticeEvent[] = readEvents(), now = Date.now()) {
  const days = new Set(events.map((e) => new Date(e.t).toDateString()));
  let streak = 0;
  for (let i = 0; i < 60; i++) { if (days.has(new Date(now - i * DAY).toDateString())) streak++; else if (i > 0) break; }
  const week = events.filter((e) => now - e.t < 7 * DAY);
  return { total: events.length, week: week.length, weekCorrect: week.filter((e) => e.ok).length, streak };
}

// ---- bookmarks: notes, papers and files a student wants to come back to
export interface Bookmark { key: string; title: string; subtitle: string; href: string; at: number }
const BM = "ompath_bookmarks_v1";
export const readBookmarks = (): Bookmark[] => { try { const v = JSON.parse(localStorage.getItem(BM) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
export function toggleBookmark(b: Omit<Bookmark, "at">): boolean {
  const all = readBookmarks();
  const has = all.some((x) => x.key === b.key);
  try { localStorage.setItem(BM, JSON.stringify(has ? all.filter((x) => x.key !== b.key) : [{ ...b, at: Date.now() }, ...all].slice(0, 100))); } catch { /* storage full */ }
  window.dispatchEvent(new Event("ompath:review"));
  return !has;
}
