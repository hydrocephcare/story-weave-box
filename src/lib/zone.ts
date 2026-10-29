// Friend Zone: live quiz rooms. The database functions are in supabase/migrations/20261029200000_friend_zone.sql; this file is the browser side:
// finding questions on the site for a topic (and filling the gap with AI-made ones, marked as such), and calling the room functions.
import { supabase } from "@/integrations/supabase/client";
import { toItems } from "@/components/QuizRunner";
import { visibleToYear } from "@/lib/noteRank";
import { askOmpathAi } from "@/lib/topicWriter";

export type ZoneMode = "speed" | "marathon" | "sudden";
export type ZoneGame = "quiz" | "lightning" | "flash" | "pairs" | "hangman" | "scramble" | "odd" | "sequence" | "image" | "case" | "drug" | "nameit" | "mixed";
export interface ZoneQuestion { q: string; options: string[]; correct: number; explanation?: string; ai?: boolean; kind?: string; image?: string }
export interface PlayQuestion { idx: number; q: string; options: string[]; ai: boolean; kind?: string; image?: string; key?: number; why?: string }
export interface ZonePlayer { id: string; nick: string; score: number; correct: number; answered: number; finished: boolean; left: number; lives: number; host: boolean; ai: boolean; me: boolean; ms: number; acct?: boolean }
export interface ZoneSettings { game?: ZoneGame; perQuestionSec?: number; minutes?: number; lives?: number; pace?: "live" | "solo"; hints?: number; assessment?: number; maxLeaves?: number; late?: number }
export interface ZoneState {
  now: number;
  room: { code: string; title: string; topic: string; mode: ZoneMode; status: "lobby" | "running" | "done"; settings: ZoneSettings; n: number; hasAi: boolean; host: string; live: boolean; slotMs: number; startedAt: number | null; endsAt: number | null };
  players: ZonePlayer[];
  me: { id: string; nick: string; host: boolean; answered: number; score: number; lives: number; finished: boolean } | null;
}
export interface ZoneAnswerResult { ok?: boolean; points?: number; late?: boolean; correct?: number; explanation?: string; score: number; lives?: number; finished?: boolean; answered?: number; stale?: boolean }
export interface ZonePeek { code: string; title: string; host: string; game: string; mode: ZoneMode; status: string; n: number; players: number; perQ: number; live: boolean; ai: boolean }
export interface ZoneHistoryRow { room_code: string; title: string; topic: string; game: string; mode: string; score: number; rank: number; players: number; correct_n: number; answered_n: number; total: number; opponents: string[]; played_at: string }
export interface ZoneResults { questions: (ZoneQuestion & { idx: number })[]; mine: { seq: number; idx: number; choice: number; ok: boolean; ms: number }[] }

export const MODES: Record<ZoneMode, { label: string; blurb: string }> = {
  speed: { label: "Speed Duel", blurb: "The same questions for everyone. A correct answer scores 100 plus up to 100 for speed." },
  marathon: { label: "Marathon", blurb: "Answer as many as you can before the clock runs out. 10 points for each correct answer." },
  sudden: { label: "Sudden Death", blurb: "A wrong answer costs a life. Run out of lives and you are out. The last one standing wins." },
};
export const AI_LEVELS = { easy: { acc: 0.5, delay: 12000, label: "Easy" }, medium: { acc: 0.7, delay: 8000, label: "Medium" }, hard: { acc: 0.9, delay: 5000, label: "Hard" } } as const;

const rpc = async <T,>(fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: T; error: { message: string } | null }> }).rpc(fn, args);
  if (error) throw new Error(error.message.replace(/^.*?: /, ""));
  return data;
};

export const newToken = () => { try { return crypto.randomUUID().replace(/-/g, "") + Math.random().toString(36).slice(2, 8); } catch { return `${Date.now()}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`; } };
const tkey = (code: string) => `zone_t_${code.toUpperCase()}`;
export const tokenFor = (code: string): string => { try { return localStorage.getItem(tkey(code)) ?? ""; } catch { return ""; } };
export const saveToken = (code: string, t: string) => { try { localStorage.setItem(tkey(code), t); } catch { /* storage blocked */ } };
export const savedNick = (): string => { try { return localStorage.getItem("zone_nick") ?? ""; } catch { return ""; } };
export const saveNick = (n: string) => { try { localStorage.setItem("zone_nick", n); } catch { /* storage blocked */ } };
export const roomLink = (code: string) => `https://www.ompathstudy.com/zone/${code}`;
export const normaliseCode = (v: string) => { const s = v.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^ZONE/, ""); return s ? `ZONE-${s.slice(0, 4)}` : ""; };

export const createRoom = (a: { title: string; topic: string; mode: ZoneMode; settings: ZoneSettings; ai: { name: string; acc: number; delay: number } | null; questions: ZoneQuestion[]; nick: string; token: string }) =>
  rpc<{ code: string }>("zone_create", { p_title: a.title, p_topic: a.topic, p_mode: a.mode, p_settings: a.settings, p_ai: a.ai, p_questions: a.questions, p_nick: a.nick, p_token: a.token });
export const joinRoom = (code: string, nick: string, token: string) => rpc<{ ok: boolean }>("zone_join", { p_code: code, p_nick: nick, p_token: token });
export const startRoom = (code: string, token: string) => rpc<{ ok: boolean }>("zone_start", { p_code: code, p_token: token });
export const getState = (code: string, token: string) => rpc<ZoneState>("zone_state", { p_code: code, p_token: token });
export const getQuestions = (code: string, token: string) => rpc<PlayQuestion[]>("zone_questions_for", { p_code: code, p_token: token });
export const sendAnswer = (code: string, token: string, seq: number, choice: number, ms: number) => rpc<ZoneAnswerResult>("zone_answer", { p_code: code, p_token: token, p_seq: seq, p_choice: choice, p_ms: ms });
export const flagLeft = (code: string, token: string) => rpc<{ ok: boolean }>("zone_flag_left", { p_code: code, p_token: token }).catch(() => undefined);
export const finishMe = (code: string, token: string) => rpc<{ ok: boolean }>("zone_finish_me", { p_code: code, p_token: token }).catch(() => undefined);
export const endRoom = (code: string, token: string) => rpc<{ ok: boolean }>("zone_end", { p_code: code, p_token: token });
export const getResults = (code: string, token: string) => rpc<ZoneResults>("zone_results", { p_code: code, p_token: token });

export const shuffle = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const topicWords = (t: string) => norm(t).split(" ").filter((w) => w.length > 2);

/** Questions for a topic from the site's own MCQ sets (the student's year and the years below only), the best matches first. */
export async function findSiteQuestions(topic: string, year: number | null, want: number): Promise<ZoneQuestion[]> {
  const words = topicWords(topic);
  if (!words.length) return [];
  const clause = (w: string) => `title.ilike.%${w.replace(/[,%()]/g, " ")}%,category.ilike.%${w.replace(/[,%()]/g, " ")}%`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as { from: (t: string) => any };
  const get = async (or: string) => {
    try { const { data } = await db.from("mcq_sets").select("id,title,category,questions").eq("published", true).is("deleted_at", null).or(or).limit(24); return (data ?? []) as { id: string; title: string; category: string; questions: unknown }[]; } catch { return []; }
  };
  let sets = await get(clause(topic.trim()));
  if (sets.length < 6) { const more = await get(words.slice(0, 4).map(clause).join(",")); const seen = new Set(sets.map((s) => s.id)); sets = [...sets, ...more.filter((s) => !seen.has(s.id))]; }
  sets = sets.filter((s) => visibleToYear(s.category, year));
  const seen = new Set<string>();
  const scored: { q: ZoneQuestion; s: number }[] = [];
  for (const set of sets) {
    const titleHit = words.filter((w) => norm(`${set.title} ${set.category}`).includes(w)).length;
    for (const it of toItems(set.id, set.category, set.questions)) {
      const key = norm(it.question).slice(0, 90);
      if (seen.has(key) || it.options.length < 2 || it.options.length > 6) continue;
      seen.add(key);
      const hit = words.filter((w) => norm(`${it.question} ${it.options.join(" ")}`).includes(w)).length;
      scored.push({ q: { q: it.question, options: it.options, correct: it.correct, explanation: it.explanation }, s: hit * 3 + titleHit + Math.random() });
    }
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, want).map((x) => x.q);
}

/** Fills a shortfall with questions written by Ompath AI, marked ai:true so the room shows they are AI-made. */
export async function aiQuestions(topic: string, count: number, unit: string): Promise<ZoneQuestion[]> {
  if (count <= 0) return [];
  const ask = `Write ${count} multiple-choice questions for MBChB students on "${topic}"${unit ? ` (${unit})` : ""}. Reply with ONLY a JSON array, no other text. Each item: {"q":"question","options":["A","B","C","D"],"correct":0,"explanation":"one sentence"} where correct is the index of the right option. One clearly best answer each, four options, no "all of the above".`;
  try {
    const text = await askOmpathAi(ask, "", topic, unit);
    const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
    const arr = JSON.parse(json) as { q?: string; options?: string[]; correct?: number; explanation?: string }[];
    return arr.filter((x) => x?.q && Array.isArray(x.options) && x.options.length >= 3 && Number.isInteger(x.correct) && x.correct! >= 0 && x.correct! < x.options.length)
      .slice(0, count).map((x) => ({ q: String(x.q), options: x.options!.map(String), correct: x.correct!, explanation: x.explanation ? String(x.explanation) : "", ai: true }));
  } catch { return []; }
}

/** A mixed set for the room: the site's own questions first, shuffled in order, then AI-made ones to reach the number wanted. */
export async function buildQuestions(topic: string, year: number | null, want: number, unit: string, allowAi = true): Promise<{ questions: ZoneQuestion[]; fromSite: number; fromAi: number }> {
  const site = await findSiteQuestions(topic, year, want);
  let ai: ZoneQuestion[] = [];
  if (allowAi && site.length < want) ai = await aiQuestions(topic, want - site.length, unit);
  const all = shuffle([...site, ...ai]).slice(0, want);
  return { questions: all, fromSite: all.filter((q) => !q.ai).length, fromAi: all.filter((q) => q.ai).length };
}

export const peekRoom = (code: string) => rpc<ZonePeek | null>("zone_peek", { p_code: code });
export const myHistory = (limit = 40) => rpc<{ played: number; wins: number; points: number; games: ZoneHistoryRow[] }>("zone_my_history", { p_limit: limit });

// A key that is always "C", or always the longest one, can be guessed. Options are put in a random order, except where the order is part of the answer ("all of the above", "both A and B").
const ORDERED = /\b(all|none|neither|both) of the (above|these|following)\b|\b(both|neither) (a|b|1|2|i|ii)\b|^\s*(a|b|c|d)\s+and\s+(a|b|c|d)\b|\bonly\s+(a|b|c|d)\b$/i;
export function shuffleOptions<T extends ZoneQuestion>(q: T): T {
  if (q.kind === "tf" || q.options.length < 3 || q.options.some((o) => ORDERED.test(o))) return q;
  const right = q.options[q.correct];
  const options = shuffle(q.options);
  return { ...q, options, correct: options.indexOf(right) };
}
