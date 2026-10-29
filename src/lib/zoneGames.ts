// The game types of Friend Zone. Every game is turned into questions with a few options and one right answer, so one engine (rooms, timers, scoring,
// the live scoreboard, the AI opponent) runs all of them. "kind" only changes how the question is dressed on screen.
import { supabase } from "@/integrations/supabase/client";
import { visibleToYear } from "@/lib/noteRank";
import { askOmpathAi } from "@/lib/topicWriter";
import { aiQuestions, buildQuestions, findSiteQuestions, shuffle, topicWords, type ZoneGame, type ZoneQuestion } from "@/lib/zone";
import { loadBank, loadCatalog, type BankQuestion } from "@/lib/questionBank";

export const GAMES: Record<ZoneGame, { label: string; blurb: string }> = {
  quiz: { label: "Quiz", blurb: "Multiple-choice questions on the topic." },
  lightning: { label: "Lightning Round", blurb: "True or false, as fast as you can, against the clock." },
  flash: { label: "Flashcard Race", blurb: "A flashcard question: pick the right answer first." },
  pairs: { label: "Match the meaning", blurb: "A term: pick the meaning that goes with it." },
  hangman: { label: "Hangman", blurb: "Letters are missing from a medical word: complete it." },
  scramble: { label: "Word Scramble", blurb: "Unscramble the letters to find the term." },
  odd: { label: "Odd One Out", blurb: "Three belong together, one does not. Spot it." },
  sequence: { label: "Sequence Sort", blurb: "Steps of a process: what comes next? (AI-made)" },
  image: { label: "Image Spot", blurb: "A picture from the anatomy, histology and embryology banks: say what it shows." },
  case: { label: "Case Showdown", blurb: "A short patient case: pick the most likely diagnosis. (AI-made)" },
  drug: { label: "Drug Duel", blurb: "Drug classes, mechanisms and side effects, head to head. (AI-made)" },
  nameit: { label: "Who am I?", blurb: "A description of a term: name it." },
  mixed: { label: "Mixed Bag", blurb: "Quiz, true or false, flashcards and meanings, all shuffled together." },
};

/** Games that need the AI to write them (a few seconds longer to set up). */
export const AI_GAMES: ZoneGame[] = ["sequence", "case", "drug"];

interface Card { q: string; a: string; term: string; deck: string }
const NL = String.fromCharCode(10);

const shortAnswer = (a: string) => {
  const first = a.split(NL).map((l) => l.replace(/^[-*•\s]+/, "").replace(/\*\*/g, "").trim()).find((l) => l.length > 3) ?? "";
  return first.length > 150 ? `${first.slice(0, 147).trimEnd()}…` : first;
};
/** "Thyroxine: what is it?" gives "Thyroxine". Only one to three plain words count as a term. */
const termOf = (q: string): string => {
  const m = q.match(/^([^:?–—-]{3,34})(?::|\s[–—-]\s)/);
  const t = (m?.[1] ?? "").replace(/\(.*?\)/g, "").trim();
  return t && t.split(/\s+/).length <= 3 && /^[A-Za-z][A-Za-z' -]+$/.test(t) ? t : "";
};

/** Flashcards on the topic from the site (the student's year and below), as a short question and a short answer, with a term where the card has one. */
async function findCards(topic: string, year: number | null): Promise<Card[]> {
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
  const pool = (list: SetRow[]): Card[] => list.filter((x) => visibleToYear(x.category, year)).flatMap((set) =>
    (Array.isArray(set.cards) ? (set.cards as { question?: unknown; answer?: unknown }[]) : [])
      .map((c) => ({ q: String(c?.question ?? "").trim(), a: shortAnswer(String(c?.answer ?? "")), deck: set.id }))
      .filter((c) => c.q.length > 5 && c.a.length > 3)
      .map((c) => ({ ...c, term: termOf(c.q) })));
  const own = pool(sets);
  // not enough on the topic itself: other decks of the year supply the wrong options and the odd ones out
  if (own.length < 12) { const filler = pool(await get()); return [...own, ...filler.filter((f) => !own.some((o) => o.q === f.q))]; }
  return own;
}

const pick = <T,>(arr: T[], n: number, not: (t: T) => boolean = () => false): T[] => shuffle(arr.filter((x) => !not(x))).slice(0, n);
const place = (right: string, wrong: string[]): { options: string[]; correct: number } => { const options = shuffle([right, ...wrong]); return { options, correct: options.indexOf(right) }; };
const scrambleWord = (w: string) => { const letters = w.toUpperCase().replace(/[^A-Z]/g, "").split(""); for (let i = 0; i < 6; i++) { const s = shuffle(letters).join(""); if (s !== letters.join("")) return s; } return [...letters].reverse().join(""); };
const mask = (w: string) => {
  const chars = w.toUpperCase().split("");
  const idx = chars.map((ch, i) => (/[A-Z]/.test(ch) ? i : -1)).filter((i) => i >= 0);
  const hide = new Set(shuffle(idx).slice(0, Math.max(2, Math.ceil(idx.length * 0.5))));
  return chars.map((ch, i) => (hide.has(i) ? "_" : ch)).join(" ");
};

const WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5 };
const bullets = (a: string): string[] => a.split(NL).map((l) => l.replace(/^[-*•\s]+/, "").replace(/\*\*/g, "").trim()).filter((l) => l.length > 2);
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : t);

/** What a picture question is answered with: the first one or two points of the model answer ("state two ..." takes two). */
function spotAnswer(q: BankQuestion): string {
  const lines = bullets(q.answer);
  const k = Math.min(lines.length, WORDS[(q.question.toLowerCase().match(/\b(two|three|four|five)\b/) ?? [])[1] ?? ""] ?? 1);
  return clip(lines.slice(0, Math.max(1, Math.min(k, 3))).join("; "), 140);
}

/** Picture questions from the spot banks (Aponeurosis Anatomy, Histology and Embryology, the Year 1 and 2 anatomy marathons), for the student's year and below. */
export async function imageQuestions(topic: string, year: number | null, want: number): Promise<ZoneQuestion[]> {
  try {
    const words = topicWords(topic);
    const metas = (await loadCatalog()).filter((m) => visibleToYear(m.category, year));
    const titled = metas.filter((m) => words.some((w) => `${m.title} ${m.category}`.toLowerCase().includes(w)));
    const generic = /^(anatomy|histology|embryology|gross|spot|pictures?|images?|aponeurosis)$/i.test(topic.trim());
    const use = titled.length ? titled : metas;
    const banks = (await Promise.all(use.map(loadBank))).filter((b): b is NonNullable<typeof b> => !!b);
    let pool = banks.flatMap((b) => b.questions).filter((q) => q.image);
    if (!titled.length && !generic && words.length) pool = pool.filter((q) => words.some((w) => `${q.question} ${q.section} ${q.answer} ${q.imageAlt ?? ""}`.toLowerCase().includes(w)));
    pool = pool.filter((q) => bullets(q.answer).length > 0 && spotAnswer(q).length > 3);
    const seen = new Set<string>();
    const out: ZoneQuestion[] = [];
    for (const q of shuffle(pool)) {
      const right = spotAnswer(q);
      if (seen.has(right.toLowerCase())) continue;
      const near = pool.filter((o) => o !== q && o.section === q.section);
      const wrong = [...new Set(shuffle(near.length >= 6 ? near : pool).map(spotAnswer).filter((t) => t.toLowerCase() !== right.toLowerCase()))].slice(0, 3);
      if (wrong.length < 3) continue;
      seen.add(right.toLowerCase());
      const options = shuffle([right, ...wrong]);
      out.push({ q: q.question, image: q.image, options, correct: options.indexOf(right), explanation: clip(bullets(q.answer).join(" • "), 700), kind: "image" });
      if (out.length >= want) break;
    }
    return out;
  } catch { return []; }
}

/** A JSON list of questions written by Ompath AI. */
async function aiList(ask: string, topic: string, unit: string): Promise<ZoneQuestion[]> {
  try {
    const text = await askOmpathAi(ask, "", topic, unit);
    const arr = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)) as { q?: string; options?: string[]; correct?: number; explanation?: string }[];
    return arr.filter((x) => x?.q && Array.isArray(x.options) && x.options.length >= 3 && Number.isInteger(x.correct) && x.correct! >= 0 && x.correct! < x.options.length && new Set(x.options.map(String)).size === x.options.length)
      .map((x) => ({ q: String(x.q), options: x.options!.map(String), correct: x.correct!, explanation: x.explanation ? String(x.explanation) : "" }));
  } catch { return []; }
}

export interface BuiltGame { questions: ZoneQuestion[]; fromSite: number; fromAi: number; note?: string }

/** A list of questions for the chosen game, from the site's own content first. */
export async function buildGame(game: ZoneGame, topic: string, year: number | null, want: number, unit: string): Promise<BuiltGame> {
  if (game === "quiz") {
    const site = await buildQuestions(topic, year, want, unit, false);
    let qs = site.questions;
    if (qs.length < want) qs = [...qs, ...(await imageQuestions(topic, year, want - qs.length))];
    if (qs.length < want) qs = [...qs, ...(await aiQuestions(topic, want - qs.length, unit))];
    qs = shuffle(qs).slice(0, want);
    return { questions: qs, fromSite: qs.filter((q) => !q.ai).length, fromAi: qs.filter((q) => q.ai).length };
  }

  if (game === "image") {
    const qs = await imageQuestions(topic, year, want);
    return { questions: qs, fromSite: qs.length, fromAi: 0, note: qs.length < want ? `Only ${qs.length} picture questions match “${topic}”. Try “anatomy”, “aponeurosis”, “histology” or a body region such as “forearm”.` : undefined };
  }

  if (game === "case" || game === "drug") {
    const ask = game === "case"
      ? `Write ${Math.min(want, 10)} short clinical case questions on "${topic}"${year ? ` for a Year ${year} MBChB student` : ""}. Each has a 2-3 sentence patient vignette (age, sex, presentation, one or two key findings) and asks for the most likely diagnosis, or the next best step. Reply with ONLY a JSON array, no other text: [{"q":"vignette and question","options":["A","B","C","D"],"correct":0,"explanation":"one sentence"}]. Four options, one clearly best answer, correct is the index.`
      : `Write ${Math.min(want, 12)} drug questions on "${topic}"${year ? ` for a Year ${year} MBChB student` : ""}: the class, mechanism, main indication or the characteristic side effect of a named drug. Reply with ONLY a JSON array, no other text: [{"q":"question naming the drug","options":["A","B","C","D"],"correct":0,"explanation":"one sentence"}]. Four options, one clearly best answer, correct is the index.`;
    const list = await aiList(ask, topic, unit);
    const qs = list.slice(0, want).map((x) => ({ ...x, ai: true, kind: game === "case" ? "case" : "drug" }));
    return { questions: qs, fromSite: 0, fromAi: qs.length, note: qs.length < 3 ? "The AI could not write that just now. Try again in a moment, or use a different topic." : undefined };
  }

  if (game === "mixed") {
    const share = Math.max(2, Math.ceil(want / 4));
    const [a, b, c, d] = await Promise.all([buildGame("quiz", topic, year, share, unit), buildGame("lightning", topic, year, share, unit), buildGame("flash", topic, year, share, unit), buildGame("pairs", topic, year, share, unit)]);
    const all = shuffle([...a.questions, ...b.questions, ...c.questions, ...d.questions]).slice(0, want);
    return { questions: all, fromSite: all.filter((q) => !q.ai).length, fromAi: all.filter((q) => q.ai).length, note: all.length < want ? `Only ${all.length} questions could be made from the site for this topic.` : undefined };
  }

  if (game === "lightning") {
    const base = await findSiteQuestions(topic, year, want * 2);
    const out: ZoneQuestion[] = base.map((b, i) => {
      const wrong = b.options.map((o, k) => ({ o, k })).filter((x) => x.k !== b.correct);
      const truth = i % 2 === 0 || !wrong.length;
      const stem = b.q.replace(/\?\s*$/, "").replace(/:\s*$/, "");
      const claim = `${stem}?${NL}Proposed answer: ${truth ? b.options[b.correct] : wrong[Math.floor(Math.random() * wrong.length)].o}`;
      return { q: claim, options: ["True", "False"], correct: truth ? 0 : 1, explanation: `Right answer: ${b.options[b.correct]}.${b.explanation ? ` ${b.explanation}` : ""}`, kind: "tf" };
    });
    const all = shuffle(out).slice(0, want);
    return { questions: all, fromSite: all.length, fromAi: 0, note: all.length < want ? `Only ${all.length} true-or-false statements could be made from the site for this topic.` : undefined };
  }

  if (game === "sequence") {
    try {
      const text = await askOmpathAi(`List the steps of "${topic}"${unit ? ` (${unit})` : ""} for an MBChB student, in the correct order, as ONLY a JSON object: {"process":"short name","steps":["step 1","step 2"]} with 5 to 8 short steps (max 7 words each).`, "", topic, unit);
      const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { process?: string; steps?: string[] };
      const steps = (j.steps ?? []).map((x) => String(x).trim()).filter(Boolean);
      if (steps.length < 4) return { questions: [], fromSite: 0, fromAi: 0, note: "I could not make a sequence for that topic. Try a process, for example “coagulation cascade” or “stages of labour”." };
      const name = j.process || topic;
      const order = `Order: ${steps.join(" → ")}`;
      const qs: ZoneQuestion[] = [];
      for (let k = 0; k < steps.length - 1; k++) qs.push({ q: `${name}: what comes straight after “${steps[k]}”?`, ...place(steps[k + 1], pick(steps, 3, (x) => x === steps[k + 1] || x === steps[k])), explanation: order, ai: true, kind: "seq" });
      for (let k = 1; k < steps.length; k++) qs.push({ q: `${name}: what comes straight before “${steps[k]}”?`, ...place(steps[k - 1], pick(steps, 3, (x) => x === steps[k - 1] || x === steps[k])), explanation: order, ai: true, kind: "seq" });
      const all = shuffle(qs).slice(0, want);
      return { questions: all, fromSite: 0, fromAi: all.length };
    } catch { return { questions: [], fromSite: 0, fromAi: 0, note: "The AI could not write that sequence just now. Try again in a moment." }; }
  }

  const cards = await findCards(topic, year);
  const named = cards.filter((c) => c.term);
  const out: ZoneQuestion[] = [];

  if (game === "flash") {
    for (const c of pick(cards, want)) out.push({ q: c.q, ...place(c.a, pick(cards, 3, (x) => x.a === c.a || x.deck === c.deck).map((x) => x.a)), explanation: "", kind: "card" });
  }
  if (game === "nameit") {
    const pool = named.length >= 4 ? named : [];
    for (const c of pick(pool, want)) out.push({ q: `Who am I?${NL}${c.a}`, ...place(c.term, pick(pool, 3, (x) => x.term.toLowerCase() === c.term.toLowerCase()).map((x) => x.term)), explanation: `${c.term}: ${c.a}`, kind: "nameit" });
  }
  if (game === "pairs") {
    for (const c of pick(named.length >= want ? named : cards, want)) out.push({ q: `Which meaning goes with “${c.term || c.q}”?`, ...place(c.a, pick(cards, 3, (x) => x.a === c.a).map((x) => x.a)), explanation: c.q, kind: "pairs" });
  }
  if (game === "hangman" || game === "scramble") {
    const words = named.filter((c) => c.term.replace(/[^A-Za-z]/g, "").length >= 5 && !/\s/.test(c.term));
    for (const c of pick(words, want)) {
      const wrong = pick(words, 3, (x) => x.term.toLowerCase() === c.term.toLowerCase()).map((x) => x.term);
      if (wrong.length < 3) continue;
      const head = game === "hangman" ? `Complete the word:  ${mask(c.term)}` : `Unscramble:  ${scrambleWord(c.term)}`;
      out.push({ q: `${head}${NL}Clue: ${c.a}`, ...place(c.term, wrong), explanation: `${c.term}: ${c.a}`, kind: game });
    }
  }
  if (game === "odd") {
    const byDeck = new Map<string, Card[]>();
    for (const c of named) byDeck.set(c.deck, [...(byDeck.get(c.deck) ?? []), c]);
    const decks = [...byDeck.entries()].filter(([, v]) => v.length >= 3);
    for (let i = 0; i < want * 3 && out.length < want && decks.length > 1; i++) {
      const [id, list] = decks[Math.floor(Math.random() * decks.length)];
      const stranger = pick(named, 1, (x) => x.deck === id)[0];
      const trio = pick(list, 3);
      if (!stranger || trio.length < 3) continue;
      out.push({ q: "Three of these belong together. Which one does not?", ...place(stranger.term, trio.map((x) => x.term)), explanation: `${trio.map((x) => x.term).join(", ")} go together. ${stranger.term} comes from a different topic.`, kind: "odd" });
    }
  }
  const all = out.slice(0, want);
  return { questions: all, fromSite: all.length, fromAi: 0, note: all.length < want ? `Only ${all.length} ${GAMES[game].label} questions could be made from the site for this topic. A broader topic gives more.` : undefined };
}
