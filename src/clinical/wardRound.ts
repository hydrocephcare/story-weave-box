// Ward rounds: several patients from one unit or topic, one after another, with a score for the round. The patients come from every case on the site
// (built-in and AI-written), so a round grows by itself as new notes are published and turned into cases.
import type { CaseDef, Rotation } from "./types";

const ACTIVE = "ompath_ward_round_v1";
const HISTORY = "ompath_ward_rounds_v1";

export interface Round { title: string; mode: string; ids: string[]; i: number; scores: number[] }
export interface RoundResult { title: string; at: number; avg: number; n: number }

const read = <T,>(store: Storage | undefined, key: string): T | null => { try { return store ? (JSON.parse(store.getItem(key) ?? "null") as T) : null; } catch { return null; } };
const write = (store: Storage | undefined, key: string, v: unknown) => { try { store?.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ } };
const ss = () => (typeof window === "undefined" ? undefined : window.sessionStorage);
const ls = () => (typeof window === "undefined" ? undefined : window.localStorage);

export const caseUrl = (id: string, mode: string) => `/clinical/case/${id}?mode=${mode}&round=1`;

/** Everything a topic search can match: title, story, tags and the note the case came from. */
export const caseText = (c: CaseDef) => `${c.title} ${c.vignette} ${(c.tags || []).join(" ")} ${c.sourceTitle || ""} ${c.category || ""} ${c.revise || ""}`.toLowerCase();

export function matching(cases: CaseDef[], rotation: Rotation | "all", query: string): CaseDef[] {
  const q = query.trim().toLowerCase();
  return cases.filter((c) => (rotation === "all" || c.rotation === rotation) && (!q || q.split(/\s+/).every((w) => caseText(c).includes(w))));
}

/** Topics the cases cover, for one-tap choices (the note a case came from, or a built-in case's first tag). */
export function topicsOf(cases: CaseDef[], limit = 14): { label: string; n: number }[] {
  const m = new Map<string, number>();
  for (const c of cases) { const t = (c.sourceTitle || c.tags?.[0] || "").split(/[:(]/)[0].trim(); if (t.length > 2) m.set(t, (m.get(t) ?? 0) + 1); }
  return [...m.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).slice(0, limit);
}

/** Patients for a round: ones not yet tried first, a spread of levels, shuffled. */
export function pickRound(cases: CaseDef[], n: number, tried: Record<string, unknown>): CaseDef[] {
  const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const fresh = shuffle(cases.filter((c) => !tried[c.id])), seen = shuffle(cases.filter((c) => tried[c.id]));
  const pool = [...fresh, ...seen].slice(0, Math.max(n * 2, n));
  const out: CaseDef[] = [];
  for (const lvl of [2, 1, 3]) { const hit = pool.find((c) => c.level === lvl && !out.includes(c)); if (hit && out.length < n) out.push(hit); }
  for (const c of pool) if (out.length < n && !out.includes(c)) out.push(c);
  return shuffle(out).slice(0, n);
}

export function startRound(cases: CaseDef[], title: string, mode: string): string | null {
  if (!cases.length) return null;
  write(ss(), ACTIVE, { title, mode, ids: cases.map((c) => c.id), i: 0, scores: [] } satisfies Round);
  return caseUrl(cases[0].id, mode);
}
export const readRound = (): Round | null => read<Round>(ss(), ACTIVE);

/** Stores the score of the patient just finished (once per patient). */
export function recordRoundScore(caseId: string, pct: number) {
  const r = readRound(); if (!r || r.ids[r.i] !== caseId) return;
  const scores = [...r.scores]; scores[r.i] = pct; write(ss(), ACTIVE, { ...r, scores });
}

/** Moves to the next patient and returns the address, or finishes the round (saved to the history) and returns null. */
export function advanceRound(): string | null {
  const r = readRound(); if (!r) return null;
  if (r.i + 1 < r.ids.length) { write(ss(), ACTIVE, { ...r, i: r.i + 1 }); return caseUrl(r.ids[r.i + 1], r.mode); }
  const got = r.scores.filter((s) => typeof s === "number");
  const result: RoundResult = { title: r.title, at: Date.now(), avg: got.length ? Math.round(got.reduce((a, b) => a + b, 0) / got.length) : 0, n: r.ids.length };
  write(ls(), HISTORY, [result, ...(read<RoundResult[]>(ls(), HISTORY) ?? [])].slice(0, 10));
  try { ss()?.removeItem(ACTIVE); } catch { /* ignore */ }
  return null;
}
export const roundHistory = (): RoundResult[] => read<RoundResult[]>(ls(), HISTORY) ?? [];
export function endRound() { try { ss()?.removeItem(ACTIVE); } catch { /* ignore */ } }
