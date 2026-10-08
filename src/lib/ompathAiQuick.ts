// Answers that cost nothing: small talk is answered on the spot, and a question asked before is answered from this device's saved copy.
// Neither calls the AI or counts toward the daily limit.
import type { SiteHit } from "@/lib/siteSearch";
import { parseQuery } from "@/lib/ompathAiQuery";

export interface QuickReply { answer: string; followUps: string[] }

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const has = (s: string, list: string[]) => list.includes(s);

const HELP_STARTS = ["Notes on psychiatry", "Year 3 pharmacology past papers", "Explain Light's criteria", "Quiz me on heart failure"];

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Small talk and "what can you do" questions. Returns null for anything that is a real study question. */
export function quickReply(input: string): QuickReply | null {
  const s = clean(input);
  if (!s || s.split(" ").length > 6) return null;

  if (has(s, ["hi", "hello", "hey", "hie", "hii", "yo", "sup", "hola", "mambo", "niaje", "vipi", "habari", "jambo", "hi there", "hello there", "hey there", "good morning", "good afternoon", "good evening", "morning", "evening", "afternoon"]))
    return { answer: `${greeting()}! What are you studying today?`, followUps: HELP_STARTS };
  if (has(s, ["thanks", "thank you", "thank you so much", "thanks a lot", "asante", "asante sana", "ty", "thx", "cheers", "nice", "great", "awesome", "cool", "perfect", "good"]))
    return { answer: "You're welcome. Ask me anything else, any time.", followUps: HELP_STARTS.slice(0, 3) };
  if (has(s, ["ok", "okay", "k", "alright", "sawa", "fine", "got it", "noted", "i see", "hmm"]))
    return { answer: "Okay. What would you like to look up?", followUps: HELP_STARTS.slice(0, 3) };
  if (has(s, ["bye", "goodbye", "good bye", "see you", "see ya", "later", "kwaheri", "good night", "goodnight", "cya"]))
    return { answer: "Goodbye, and good luck with your revision.", followUps: [] };
  if (has(s, ["how are you", "how are you doing", "how r u", "how are u", "u good", "you good", "whats up", "what s up", "wassup", "how is it going", "how are things"]))
    return { answer: "I'm well, thanks. Ready when you are. What do you need?", followUps: HELP_STARTS };
  if (has(s, ["who are you", "what are you", "who r u", "your name", "what is your name", "whats your name", "what s your name", "who made you", "who built you", "who created you", "are you ai", "are you a bot", "are you real"]))
    return { answer: "I'm **Ompath AI**, the study assistant on Ompath Study, built by Abongo for MBChB students. I search every note, past paper, MCQ and library file on the site, and explain things in plain words.", followUps: HELP_STARTS };
  if (has(s, ["help", "help me", "what can you do", "what do you do", "how do i use you", "how does this work", "how to use", "features", "commands", "what can i ask", "what can i ask you", "guide", "menu"]))
    return { answer: "Here is what I can do:\n- **Find notes.** Try \"notes on psychiatry\" or \"year 4 internal medicine\".\n- **Find past papers, CATs and library files.** Try \"year 3 pharmacology past papers\".\n- **Explain a topic.** Try \"explain Light's criteria\".\n- **Quiz you.** Try \"quiz me on heart failure\".\n\nTap any note to read it here. Close it and you are back in the chat. Your chats are saved under the clock icon.", followUps: HELP_STARTS };
  if (has(s, ["sorry", "my bad", "pole", "oops"]))
    return { answer: "No problem at all. What would you like to look up?", followUps: HELP_STARTS.slice(0, 3) };
  return null;
}

// ---- Saved answers ---------------------------------------------------------------------------------------------

export interface CachedAnswer { answer: string; grounded: boolean; hits: SiteHit[]; followUps?: string[]; at: number }

const KEY = "ompath_ai_cache_v1";
const MAX = 60;
const TTL = 14 * 24 * 3600 * 1000;

/** Same question, different wording or capitals, gives the same key ("Psych notes" and "notes on psychiatry!" match). */
export function cacheKey(input: string): string {
  const p = parseQuery(input);
  const words = p.topic.split(" ").filter(Boolean).sort().join(" ");
  return `${p.wants}|${p.year ?? ""}|${words || clean(input)}`;
}

function readAll(): Record<string, CachedAnswer> {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}

export function getCached(input: string): CachedAnswer | null {
  const hit = readAll()[cacheKey(input)];
  return hit && Date.now() - hit.at < TTL && hit.answer ? hit : null;
}

export function saveCached(input: string, value: Omit<CachedAnswer, "at">) {
  try {
    const all = readAll();
    all[cacheKey(input)] = { ...value, hits: value.hits.slice(0, 12), at: Date.now() };
    const kept = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch { /* storage full or blocked */ }
}

export function dropCached(input: string) {
  try { const all = readAll(); delete all[cacheKey(input)]; localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* ignore */ }
}

// ---- Answers shared by every student ------------------------------------------------------------------------------
// Needs the table in supabase/migrations/20261008120000_ompath_ai_answer_cache.sql. Without it every call below quietly does nothing.
import { supabase } from "@/integrations/supabase/client";

// The table is new, so it is not in the generated types yet.
const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> }; // eslint-disable-line @typescript-eslint/no-explicit-any

const withTimeout = <T,>(p: PromiseLike<T>, ms: number): Promise<T | null> => Promise.race<T | null>([Promise.resolve(p), new Promise<null>((r) => window.setTimeout(() => r(null), ms))]);

export async function getShared(input: string): Promise<{ answer: string; grounded: boolean } | null> {
  try {
    const key = cacheKey(input);
    const res = (await withTimeout(db.from("ai_answer_cache").select("answer,grounded").eq("cache_key", key).lt("reports", 2).maybeSingle(), 2500)) as { data?: { answer?: string; grounded?: boolean }; error?: unknown } | null;
    if (!res || res.error || !res.data?.answer || res.data.grounded === false) return null; // answers from general knowledge are never shared
    void db.rpc("ai_cache_touch", { k: key });
    return { answer: String(res.data.answer), grounded: true };
  } catch { return null; }
}

export async function saveShared(input: string, answer: string, grounded: boolean) {
  if (!grounded) return; // only answers built from the site's own notes are worth sharing
  try {
    await db.from("ai_answer_cache").insert({ cache_key: cacheKey(input), question: input.trim().slice(0, 400), answer: answer.slice(0, 8000), grounded });
  } catch { /* already saved by someone else, or the table is not set up */ }
}

export async function reportShared(input: string) {
  try { await db.rpc("ai_cache_report", { k: cacheKey(input) }); } catch { /* ignore */ }
}

export async function getTrending(): Promise<string[]> {
  try {
    const res = (await withTimeout(db.rpc("ai_cache_trending", { n: 6 }), 2500)) as { data: unknown; error: unknown } | null;
    const rows = (res && !res.error && Array.isArray(res.data) ? res.data : []) as { question: string }[];
    return rows.map((r) => r.question).filter(Boolean);
  } catch { return []; }
}
