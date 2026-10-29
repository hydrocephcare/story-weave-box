// The flashcard-based games of Friend Zone (Flashcard Race, Match the meaning, Who am I?, Hangman, Word Scramble, Odd One Out).
// Questions come only from decks on the topic; wrong options are taken from the same deck first (so they look like the right one), never repeated,
// and never from a card whose "term" is really a deck title or an instruction.
import { supabase } from "@/integrations/supabase/client";
import { visibleToYear } from "@/lib/noteRank";
import { shuffle, topicWords, type ZoneQuestion } from "@/lib/zone";
import { askOmpathAi } from "@/lib/topicWriter";

export interface Card { q: string; a: string; term: string; deck: string; own: boolean }
export type CardGame = "flash" | "pairs" | "hangman" | "scramble" | "odd" | "nameit";
const NL = String.fromCharCode(10);

export const nk = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const shortAnswer = (a: string) => {
  const first = a.split(NL).map((l) => l.replace(/^[-*•\s]+/, "").replace(/\*\*/g, "").trim()).find((l) => l.length > 3) ?? "";
  return first.length > 150 ? `${first.slice(0, 147).trimEnd()}…` : first;
};

const NOT_A_TERM = /flashcards?|notes?\b|terms\b|overview|introduction|summary|revision|questions?\b|mcqs?|\bquiz\b|\bpart \d/i;
const INSTRUCTION = /^(explain|what|how|why|describe|list|define|compare|state|outline|discuss|name|identify|give|differentiate|classify|enumerate|mention|when|where|which|who)\b/i;
/** "Thyroxine: what is it?" gives "Thyroxine". Only one to three plain words that are a name, not a deck title or an instruction, count as a term. */
export const termOf = (q: string): string => {
  const m = q.match(/^([^:?–—-]{3,34})(?::|\s[–—-]\s)/);
  const t = (m?.[1] ?? "").replace(/\(.*?\)/g, "").trim();
  if (!t || t.split(/\s+/).length > 3 || !/^[A-Za-z][A-Za-z' -]+$/.test(t)) return "";
  if (NOT_A_TERM.test(t) || INSTRUCTION.test(t) || t.replace(/[^A-Za-z]/g, "").length < 4) return "";
  return t;
};

/** Cards of the decks on the topic (own: true), plus cards of other decks of the year that can only be used as wrong options. */
export async function findCards(topic: string, year: number | null): Promise<Card[]> {
  const words = topicWords(topic);
  const clause = (w: string) => `title.ilike.%${w.replace(/[,%()]/g, " ")}%,category.ilike.%${w.replace(/[,%()]/g, " ")}%`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as { from: (t: string) => any };
  type SetRow = { id: string; title: string; category: string; cards: unknown };
  const get = async (or?: string): Promise<SetRow[]> => {
    try {
      let q = db.from("flashcard_sets").select("id,title,category,cards").eq("published", true).is("deleted_at", null);
      if (or) q = q.or(or);
      const { data } = await q.limit(or ? 24 : 14);
      return (data ?? []) as SetRow[];
    } catch { return []; }
  };
  let sets = await get(clause(topic.trim()));
  if (sets.length < 4 && words.length) { const more = await get(words.slice(0, 4).map(clause).join(",")); const seen = new Set(sets.map((x) => x.id)); sets = [...sets, ...more.filter((x) => !seen.has(x.id))]; }
  const pool = (list: SetRow[], own: boolean): Card[] => list.filter((x) => visibleToYear(x.category, year)).flatMap((set) =>
    (Array.isArray(set.cards) ? (set.cards as { question?: unknown; answer?: unknown }[]) : [])
      .map((c) => ({ q: String(c?.question ?? "").trim(), a: shortAnswer(String(c?.answer ?? "")), deck: set.id }))
      .filter((c) => c.q.length > 5 && c.a.length > 3)
      .map((c) => ({ ...c, term: termOf(c.q), own })));
  const mine = pool(sets, true);
  const filler = (await get()).filter((x) => !sets.some((s) => s.id === x.id));
  return [...mine, ...pool(filler, false)];
}

/** Up to n wrong options (field "a" or "term"): the same deck first, then other decks on the topic, then other decks of the year. Never a repeat, never the right one. */
export function distract(c: Card, all: Card[], field: "a" | "term", n = 3): string[] {
  const seen = new Set([nk(c[field])]);
  const out: string[] = [];
  const add = (list: Card[]) => {
    for (const x of shuffle(list)) {
      if (out.length >= n) return;
      const v = x[field];
      if (!v || x === c || seen.has(nk(v)) || nk(v).includes(nk(c[field])) || nk(c[field]).includes(nk(v))) continue;
      seen.add(nk(v)); out.push(v);
    }
  };
  add(all.filter((x) => x.own && x.deck === c.deck));
  add(all.filter((x) => x.own && x.deck !== c.deck));
  add(all.filter((x) => !x.own));
  return out;
}

/** No flashcards on the topic: the AI lists groups of related terms with a one-sentence clue each, and they are used as if they were decks. */
async function aiCards(topic: string, year: number | null): Promise<Card[]> {
  const ask = "For a " + (year ? "Year " + year + " " : "") + "MBChB student revising \"" + topic + "\", list 3 groups of related terms, 5 terms in each group, mostly single words of 5 or more letters. Reply with ONLY JSON: {\"groups\":[{\"name\":\"group name\",\"terms\":[{\"term\":\"one or two words\",\"clue\":\"one sentence that describes it without using the term\"}]}]}";
  try {
    const text = await askOmpathAi(ask, "", topic, "");
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { groups?: { terms?: { term?: string; clue?: string }[] }[] };
    const out: Card[] = [];
    (j.groups ?? []).forEach((g, gi) => (g.terms ?? []).forEach((t) => {
      const term = String(t.term ?? "").trim(), clue = String(t.clue ?? "").trim();
      if (term.length >= 3 && term.length <= 34 && term.split(/\s+/).length <= 3 && clue.length > 8) out.push({ q: term + ": what is it?", a: clue.slice(0, 150), term, deck: "ai-" + gi, own: true });
    }));
    return out;
  } catch { return []; }
}

const place = (right: string, wrong: string[]): { options: string[]; correct: number } => { const options = shuffle([right, ...wrong]); return { options, correct: options.indexOf(right) }; };
const scrambleWord = (w: string) => { const letters = w.toUpperCase().replace(/[^A-Z]/g, "").split(""); for (let i = 0; i < 6; i++) { const s = shuffle(letters).join(""); if (s !== letters.join("")) return s; } return [...letters].reverse().join(""); };
const mask = (w: string) => {
  const chars = w.toUpperCase().split("");
  const idx = chars.map((ch, i) => (/[A-Z]/.test(ch) ? i : -1)).filter((i) => i >= 0);
  const hide = new Set(shuffle(idx).slice(0, Math.max(2, Math.ceil(idx.length * 0.5))));
  return chars.map((ch, i) => (hide.has(i) ? "_" : ch)).join(" ");
};
const uniqueBy = <T,>(list: T[], key: (t: T) => string): T[] => { const seen = new Set<string>(); return list.filter((x) => { const k = key(x); if (!k || seen.has(k)) return false; seen.add(k); return true; }); };

export async function buildCardGame(game: CardGame, topic: string, year: number | null, want: number): Promise<ZoneQuestion[]> {
  let cards = await findCards(topic, year);
  let mine = cards.filter((c) => c.own);
  let aiMade = false;
  if (mine.length < 4 || (game === "odd" && new Set(mine.filter((c) => c.term).map((c) => c.deck)).size < 2)) {
    const made = await aiCards(topic, year);
    if (made.length >= 6) { cards = [...made, ...cards.filter((c) => !c.own)]; mine = made; aiMade = true; } else if (mine.length < 4) return [];
  }
  const named = uniqueBy(mine.filter((c) => c.term), (c) => nk(c.term));
  const out: ZoneQuestion[] = [];

  if (game === "flash") {
    for (const c of shuffle(mine)) {
      const wrong = distract(c, cards, "a");
      if (wrong.length < 3) continue;
      out.push({ q: c.q, ...place(c.a, wrong), explanation: "", kind: "card" });
      if (out.length >= want) break;
    }
  }
  if (game === "nameit") {
    for (const c of shuffle(named)) {
      const wrong = distract(c, [...named, ...cards.filter((x) => !x.own)], "term");
      if (wrong.length < 3) continue;
      out.push({ q: `Who am I?${NL}${c.a}`, ...place(c.term, wrong), explanation: `${c.term}: ${c.a}`, kind: "nameit" });
      if (out.length >= want) break;
    }
  }
  if (game === "pairs") {
    for (const c of shuffle(named.length >= 4 ? named : mine)) {
      const wrong = distract(c, cards, "a");
      if (wrong.length < 3) continue;
      out.push({ q: `Which meaning goes with “${c.term || c.q}”?`, ...place(c.a, wrong), explanation: c.q, kind: "pairs" });
      if (out.length >= want) break;
    }
  }
  if (game === "hangman" || game === "scramble") {
    const words = named.filter((c) => c.term.replace(/[^A-Za-z]/g, "").length >= 5 && !/\s/.test(c.term));
    for (const c of shuffle(words)) {
      const wrong = distract(c, [...words, ...cards.filter((x) => !x.own && /^[A-Za-z]{5,}$/.test(x.term))], "term");
      if (wrong.length < 3) continue;
      const head = game === "hangman" ? `Complete the word:  ${mask(c.term)}` : `Unscramble:  ${scrambleWord(c.term)}`;
      out.push({ q: `${head}${NL}Clue: ${c.a}`, ...place(c.term, wrong), explanation: `${c.term}: ${c.a}`, kind: game });
      if (out.length >= want) break;
    }
  }
  if (game === "odd") {
    const byDeck = new Map<string, Card[]>();
    for (const c of named) byDeck.set(c.deck, [...(byDeck.get(c.deck) ?? []), c]);
    const decks = [...byDeck.entries()].filter(([, v]) => v.length >= 3);
    const used = new Set<string>();
    for (let i = 0; i < want * 4 && out.length < want && decks.length > 1; i++) {
      const [id, list] = decks[Math.floor(Math.random() * decks.length)];
      const trio = shuffle(list).slice(0, 3);
      const stranger = shuffle(named.filter((x) => x.deck !== id && !trio.some((t) => nk(t.term).includes(nk(x.term)) || nk(x.term).includes(nk(t.term)))))[0];
      if (!stranger || trio.length < 3 || used.has(nk(stranger.term))) continue;
      used.add(nk(stranger.term));
      out.push({ q: "Three of these belong together. Which one does not?", ...place(stranger.term, trio.map((x) => x.term)), explanation: `${trio.map((x) => x.term).join(", ")} go together. ${stranger.term} comes from a different topic.`, kind: "odd" });
    }
  }
  return out.slice(0, want).map((q) => (aiMade ? { ...q, ai: true } : q));
}
