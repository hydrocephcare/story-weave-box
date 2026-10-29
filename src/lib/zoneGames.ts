// The game types of Friend Zone. Every game is turned into questions with a few options and one right answer, so one engine (rooms, timers, scoring,
// the live scoreboard, the AI opponent) runs all of them. "kind" only changes how the question is dressed on screen.
import { askOmpathAi } from "@/lib/topicWriter";
import { aiQuestions, buildQuestions, findSiteQuestions, shuffle, shuffleOptions, type ZoneGame, type ZoneQuestion } from "@/lib/zone";
import { imageQuestions } from "@/lib/zoneImage";
import { buildCardGame, type CardGame } from "@/lib/zoneCards";

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

const NL = String.fromCharCode(10);

const pick = <T,>(arr: T[], n: number, not: (t: T) => boolean = () => false): T[] => shuffle(arr.filter((x) => !not(x))).slice(0, n);
const place = (right: string, wrong: string[]): { options: string[]; correct: number } => { const options = shuffle([right, ...wrong]); return { options, correct: options.indexOf(right) }; };

/** A JSON list of questions written by Ompath AI. */
async function aiList(ask: string, topic: string, unit: string): Promise<ZoneQuestion[]> {
  try {
    const text = await askOmpathAi(ask, "", topic, unit);
    const arr = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)) as { q?: string; options?: string[]; correct?: number; explanation?: string }[];
    return arr.filter((x) => x?.q && Array.isArray(x.options) && x.options.length >= 3 && Number.isInteger(x.correct) && x.correct! >= 0 && x.correct! < x.options.length && new Set(x.options.map(String)).size === x.options.length)
      .map((x) => ({ q: String(x.q), options: x.options!.map(String), correct: x.correct!, explanation: x.explanation ? String(x.explanation) : "" }));
  } catch { return []; }
}

/** True or false statements on a topic written by the AI, half of them true, for when the site has no questions to turn into statements. */
async function aiTrueFalse(topic: string, year: number | null, want: number, unit: string): Promise<ZoneQuestion[]> {
  const ask = "Write " + Math.min(Math.max(want, 8), 20) + " true or false statements on \"" + topic + "\"" + (year ? " for a Year " + year + " MBChB student" : "") + ", about half true and half false, each a single clear factual statement. Reply with ONLY a JSON array: [{\"statement\":\"...\",\"true\":true,\"explanation\":\"one sentence\"}]";
  try {
    const text = await askOmpathAi(ask, "", topic, unit);
    const arr = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)) as { statement?: string; true?: boolean; explanation?: string }[];
    return arr.filter((x) => x?.statement && typeof x.true === "boolean").slice(0, want)
      .map((x) => ({ q: String(x.statement), options: ["True", "False"], correct: x.true ? 0 : 1, explanation: x.explanation ? String(x.explanation) : "", ai: true, kind: "tf" }));
  } catch { return []; }
}

export interface BuiltGame { questions: ZoneQuestion[]; fromSite: number; fromAi: number; note?: string }

/** A list of questions for the chosen game, from the site's own content first. */
async function buildGameRaw(game: ZoneGame, topic: string, year: number | null, want: number, unit: string): Promise<BuiltGame> {
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
    let all = shuffle([...a.questions, ...b.questions, ...c.questions, ...d.questions]).slice(0, want);
    if (all.length < want) all = shuffle([...all, ...(await aiQuestions(topic, want - all.length, unit))]);
    return { questions: all, fromSite: all.filter((q) => !q.ai).length, fromAi: all.filter((q) => q.ai).length, note: all.length < want ? `Only ${all.length} questions could be made from the site for this topic.` : undefined };
  }

  if (game === "lightning") {
    const base = await findSiteQuestions(topic, year, want * 2);
    const out: ZoneQuestion[] = base.map((b, i) => {
      const wrong = b.options.map((o, k) => ({ o, k })).filter((x) => x.k !== b.correct);
      const truth = Math.random() < 0.5 || !wrong.length;
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

  const all = await buildCardGame(game as CardGame, topic, year, want);
  return { questions: all, fromSite: all.length, fromAi: 0, note: all.length < want ? (all.length === 0 ? `There are no flashcards on “${topic}” to build ${GAMES[game].label} from. Try a broader topic, for example “endocrine” or “anatomy”.` : `Only ${all.length} ${GAMES[game].label} questions could be made from the site for this topic. A broader topic gives more.`) : undefined };
}

/** The questions for the chosen game, with the options of every question in a random order so the right one is never in a predictable place. */
export async function buildGame(game: ZoneGame, topic: string, year: number | null, want: number, unit: string): Promise<BuiltGame> {
  let r = await buildGameRaw(game, topic, year, want, unit);
  // the site has nothing on this topic for this game: the AI writes the questions instead, so every game starts for every topic
  if (r.questions.length < 3 && !AI_GAMES.includes(game)) {
    const fb = game === "lightning" ? await aiTrueFalse(topic, year, want, unit) : await aiQuestions(topic, want, unit);
    if (fb.length >= 3) r = { questions: fb, fromSite: 0, fromAi: fb.length, note: "Nothing on the site matched this game for “" + topic + "”, so the AI wrote the questions." };
  }
  return { ...r, questions: r.questions.map(shuffleOptions) };
}
