// Where the right answer sits in a multiple-choice bank. A bank whose answers are mostly "A", or that never repeats a letter twice in a row, can be passed by
// guessing the pattern instead of knowing the medicine. This module finds those banks and fixes them by moving options, never by changing which option is right.
// One copy is shared by the site (src), the scripts and the edge functions, so every place that writes or checks questions uses the same rules.
//
// Rules kept everywhere:
// - The right answer is identified by its text when the question carries `correct_answer_text` that matches exactly one option (that is what the site grades
//   against), otherwise by `correct_answer`. When the two disagree, or neither points at an option, the question is flagged and never moved.
// - A question is moved by swapping the right option with the option at the new position; everything else on the question is kept as it was.
// - Questions whose option order means something are never moved: options that point at each other ("all of the above", "A and B"), explanations or stems that
//   name a letter ("option C is wrong", "the structure labelled B"), ordered numbers or grades, sequence questions, and two-option (true/false) items.
// - Balancing is deterministic for a given seed (a bank's id), so a re-run makes the same choices, and a bank that is already fair is left untouched.

export const LETTERS = "ABCDEFGHIJ";

const clean = (v) => String(v ?? "")
  .replace(/&nbsp;| /gi, " ")
  .replace(/<[^>]*>/g, " ")
  .replace(/\*+/g, "")
  .replace(/^\s*(?:option\s*)?[A-J]\s*[.)]\s+/i, "")
  .replace(/\s+/g, " ")
  .trim()
  .toLocaleLowerCase();

/** A small, fast seeded random generator (mulberry32 over an FNV-1a hash of the seed). */
export function seededRandom(seed) {
  let h = 2166136261;
  const s = String(seed ?? "");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = (h >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shuffled = (list, rand) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};

const isMcq = (q) => !!q && typeof q === "object" && Array.isArray(q.options) && q.options.length >= 2 && (!q.type || q.type === "mcq");

/**
 * The right option of one question. `index` is -1 when it cannot be established. `problem` names a disagreement worth a human look:
 * "no-answer" (nothing points at an option), "text-not-found" (the saved answer text matches no option and there is no valid number),
 * "text-index-mismatch" (the saved text and the saved number point at different options), "duplicate-answer-text" (the saved text matches more than
 * one option). `staleText` marks a saved text that matches no option while the number is valid: the site grades by the number, so that is the answer.
 */
export function correctIndex(q) {
  if (!isMcq(q)) return { index: -1, source: null, problem: "not-mcq" };
  const n = q.options.length;
  const raw = q.correct_answer;
  const num = typeof raw === "number" ? raw : (typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw) : NaN);
  const byIndex = Number.isInteger(num) && num >= 0 && num < n ? num : -1;
  const text = typeof q.correct_answer_text === "string" ? clean(q.correct_answer_text) : "";
  if (text) {
    const hits = q.options.map((o, i) => (clean(o) === text ? i : -1)).filter((i) => i >= 0);
    if (hits.length === 1) {
      return byIndex >= 0 && byIndex !== hits[0]
        ? { index: hits[0], source: "text", problem: "text-index-mismatch" }
        : { index: hits[0], source: "text", problem: null };
    }
    if (hits.length > 1) return { index: byIndex, source: byIndex >= 0 ? "index" : null, problem: "duplicate-answer-text" };
    // older tools saved a short form of the answer and later reworded or lengthened the options ("Arachnoid villi" -> "Arachnoid villi obstruction"):
    // the number decides, as it does on the site, when the saved text is clearly closest to that option; clearly closest to another one is a conflict
    const words = (t) => new Set(t.split(/[^a-z0-9]+/).filter((w) => w.length > 2));
    const tw = words(text);
    const score = q.options.map((o) => { const ow = words(clean(o)); let n = 0; for (const w of tw) if (ow.has(w)) n++; return tw.size ? n / Math.max(1, Math.min(tw.size, ow.size || 1)) : 0; });
    const order = score.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const [best, second] = [order[0], order[1] ?? [0, -1]];
    if (byIndex >= 0 && best[0] >= 0.6 && best[0] - second[0] >= 0.2) {
      return best[1] === byIndex ? { index: byIndex, source: "index", problem: null } : { index: byIndex, source: "index", problem: "text-index-mismatch" };
    }
    // otherwise the saved text is simply out of date (the options were rewritten later and the text was not): the site grades by the number then,
    // so the number is the answer; a move rewrites the text to match
    return byIndex >= 0 ? { index: byIndex, source: "index", problem: null, staleText: true } : { index: -1, source: null, problem: "text-not-found" };
  }
  return byIndex >= 0 ? { index: byIndex, source: "index", problem: null } : { index: -1, source: null, problem: "no-answer" };
}

// Patterns below are matched against text whose words are lower-cased but whose single letters keep their case (see `letterCase`), so "Option C" and
// "option C" both count while "vitamin a" or a list item "(a)" do not.
const letterCase = (t) => String(t ?? "").replace(/[A-Za-z]{2,}/g, (w) => w.toLowerCase());
// options that only make sense in their place
const OPTION_REFERS = /\b(all|none|both|neither|any)\b.{0,16}\b(above|below|these|those|options?|choices?|of the following)\b|\bany of the\b|^\s*(both|neither|all|none)\b[^a-z]*$|\b[A-F]\s*(?:and|&|or|,|\+)\s*[A-F]\b|\b[a-f]\s*(?:and|&|,)\s*[a-f]\b|\b(?:options?|choices?)\s*\(?[A-Fa-f1-9]\)?(?![A-Za-z])|^\s*\(?[A-F]\)?\s*(?:only)?\s*$/;
// a stem, option or explanation that names an option by its letter ("option C", "the structure labelled B", "B is correct", "Answer: D")
const LETTER_REF = /\b(?:options?|choices?|answers?|alternatives?|responses?|letters?|labell?ed|marked|statements?)\s*(?:is|:|-)?\s*\(?\s*[A-F]\s*\)?(?![A-Za-z'’(])|(?:^|[\s(])\(?[A-F]\)?\s*(?:is|are|was|would be)\s+(?:the\s+)?(?:correct|incorrect|wrong|right|false|true|best answer|answer)\b/m;
// a line that starts with an option label ("B. Region ..."), checked on the raw text so "C. fetus" or "E. coli" (lower-case word after) do not count
const LINE_LABEL = /^\s*\(?[A-F]\s*[.):]\s+(?=[A-Z0-9])/m;
const SEQUENCE_STEM = /\b(correct|right|proper|logical|chronological|usual|normal)\s+(order|sequence)\b|\b(arrange|rank|order|sequence)\s+(the following|these|them)\b|\bin (?:the )?(?:correct |right |proper )?(?:order|sequence)\b|\bsequence of (?:events|steps|stages)\b|\b(ascending|descending|increasing|decreasing) order\b|\bwhich (?:comes|happens|occurs) (?:first|next|last)\b/i;
// an option that gives itself away ("305 Correct", "Iron (correct answer)")
export const MARKED_OPTION = /(?<!\b(?:is|are|be|not|was|were|all|both|none|neither|of)\s)[([]?\b(?:correct(?:\s+answer)?|right\s+answer)[)\]]?\s*[✓✔]?\s*$|[✓✔]\s*$/i;
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
const leadingNumber = (o) => {
  const t = clean(o).replace(/^(?:stage|grade|class|type|step|phase|level|degree|group|day|week|month|year)s?\s+/, "");
  const m = t.match(/^[<>≤≥~≈]?\s*(-?\d+(?:[.,]\d+)?)/);
  if (m) return Number(m[1].replace(",", "."));
  const r = t.match(/^(i{1,3}|iv|v|vi{1,3}|ix|x)\b/);
  if (r) return ROMAN[r[1]];
  const ord = ["first", "second", "third", "fourth", "fifth", "sixth"].indexOf(t.split(/\s/)[0]);
  return ord >= 0 ? ord + 1 : NaN;
};

/** Why this question's options must stay where they are ("" when they may be moved). */
export function orderSensitive(q) {
  if (!isMcq(q)) return "not-mcq";
  const opts = q.options.map((o) => String(o ?? ""));
  if (opts.length < 3) return "two-options";
  if (opts.some((o) => OPTION_REFERS.test(letterCase(o)))) return "options-refer-to-each-other";
  if (opts.some((o) => LETTER_REF.test(letterCase(o)) || LINE_LABEL.test(o))) return "option-names-a-letter";
  if (LETTER_REF.test(letterCase(q.question))) return "stem-names-a-letter";
  if (LETTER_REF.test(letterCase(q.explanation)) || LINE_LABEL.test(String(q.explanation ?? ""))) return "explanation-names-a-letter";
  if (SEQUENCE_STEM.test(String(q.question ?? ""))) return "sequence-question";
  const nums = opts.map(leadingNumber);
  if (nums.every((x) => Number.isFinite(x))) {
    const up = nums.every((x, i) => i === 0 || x > nums[i - 1]);
    const down = nums.every((x, i) => i === 0 || x < nums[i - 1]);
    if (up || down) return "ordered-values";
  }
  return "";
}

/** The letter an explanation states as the answer ("Answer: C", "The correct answer is (B)"), as an index, or -1. */
export function statedAnswerLetter(text) {
  const m = String(text ?? "").match(/\b(?:[Cc]orrect\s+)?[Aa]nswer\s*(?:is|:|=|-)\s*(?:[Oo]ption\s*)?\(?([A-F])\)?(?![A-Za-z])/);
  return m ? LETTERS.indexOf(m[1].toUpperCase()) : -1;
}

// Upper tail of the chi-square distribution at p = 0.01 for 1..9 degrees of freedom.
const CHI_01 = [0, 6.63, 9.21, 11.34, 13.28, 15.09, 16.81, 18.48, 20.09, 21.67];

function groupStats(positions, k) {
  const counts = Array.from({ length: k }, () => 0);
  positions.forEach((p) => { counts[p] += 1; });
  const n = positions.length;
  const expected = n / k;
  const chi = n ? counts.reduce((s, c) => s + ((c - expected) ** 2) / expected, 0) : 0;
  return { n, counts, chi, maxShare: n ? Math.max(...counts) / n : 0 };
}

function sequenceStats(seq) {
  let repeats = 0, steps = 0, run = seq.length ? 1 : 0, longestRun = run;
  for (let i = 1; i < seq.length; i++) {
    const [p, c] = [seq[i - 1], seq[i]];
    if (p.pos === c.pos) { repeats++; run++; longestRun = Math.max(longestRun, run); } else run = 1;
    if (p.k === c.k && c.pos === (p.pos + 1) % c.k) steps++;
  }
  return { pairs: Math.max(0, seq.length - 1), repeats, steps, longestRun };
}

/**
 * The answer-position health of one bank. Counts are per option count (4-option and 5-option questions are judged separately) and never include the
 * question text, so the report can be shown to staff without revealing answers. `issues` is empty for a fair bank. Thresholds are statistical: a
 * chi-square test at p < 0.01, a single letter holding over twice its fair share, a bank where every answer shares one letter, no letter ever repeating
 * across 16+ questions (chance below 1%), answers stepping A, B, C, D in order, or one letter running 6+ times.
 */
export function auditBank(questions) {
  const list = Array.isArray(questions) ? questions : [];
  const seq = [];
  const flagged = [];
  let movable = 0, fixed = 0, mcqs = 0, staleText = 0;
  const byK = new Map();
  list.forEach((q, i) => {
    if (!isMcq(q)) return;
    mcqs++;
    const ans = correctIndex(q);
    const lock = orderSensitive(q);
    const stated = statedAnswerLetter(q.explanation);
    if (ans.staleText) staleText++;
    if (ans.problem && ans.problem !== "not-mcq") flagged.push({ index: i, reason: ans.problem });
    else if (q.options.some((o) => MARKED_OPTION.test(String(o ?? "")))) flagged.push({ index: i, reason: "option-text-marks-the-answer" });
    else if (stated >= 0 && ans.index >= 0 && stated !== ans.index) flagged.push({ index: i, reason: "explanation-states-another-letter" });
    if (ans.index < 0) return;
    const k = q.options.length;
    if (!byK.has(k)) byK.set(k, []);
    byK.get(k).push(ans.index);
    seq.push({ pos: ans.index, k });
    if (lock) fixed++; else movable++;
  });
  const groups = [...byK.entries()].sort((a, b) => a[0] - b[0]).map(([k, positions]) => ({ k, ...groupStats(positions, k) }));
  const total = groups.reduce((s, g) => s + g.n, 0);
  const counts = Array.from({ length: Math.max(0, ...groups.map((g) => g.k)) }, (_, p) => groups.reduce((s, g) => s + (g.counts[p] || 0), 0));
  const order = sequenceStats(seq);
  const issues = [];
  for (const g of groups) {
    if (g.k < 3) continue;
    const tag = groups.length > 1 ? ` (${g.k}-option)` : "";
    if (g.n >= 4 && g.counts.some((c) => c === g.n)) issues.push(`all-one-letter${tag}`);
    else if (g.n >= 8 && g.chi > (CHI_01[g.k - 1] ?? Infinity)) issues.push(`uneven${tag}`);
    else if (g.n >= 12 && g.maxShare > 2 / g.k) issues.push(`one-letter-dominates${tag}`);
  }
  const avgK = total ? groups.reduce((s, g) => s + g.k * g.n, 0) / total : 4;
  if (order.pairs >= 15 && order.repeats === 0) issues.push("never-repeats");
  if (order.pairs >= 8 && order.steps / order.pairs > 0.6) issues.push("stepping-pattern");
  if (order.longestRun >= (avgK <= 4 ? 6 : 5)) issues.push("long-run");
  return { mcqs, total, counts, groups, ...order, movable, fixed, staleText, flagged, issues };
}

/** Puts the right option of `q` at `to` by swapping it with the option already there. Returns a new question; `q` is not changed. */
export function moveAnswer(q, to) {
  const { index: from } = correctIndex(q);
  if (from < 0 || to < 0 || to >= q.options.length || to === from) return q;
  const options = [...q.options];
  [options[from], options[to]] = [options[to], options[from]];
  const out = { ...q, options, correct_answer: to };
  if (Object.prototype.hasOwnProperty.call(q, "correct_answer_text")) out.correct_answer_text = options[to];
  return out;
}

const canMove = (q) => isMcq(q) && !orderSensitive(q) && !q.options.some((o) => MARKED_OPTION.test(String(o ?? ""))) && (() => { const a = correctIndex(q); return a.index >= 0 && !a.problem && !(statedAnswerLetter(q.explanation) >= 0); })();

/**
 * Fair positions for a bank. Only banks with an issue are changed (pass `force` to even out any bank). Uneven counts are fixed with the fewest moves:
 * surplus answers (picked at random among the movable ones) go to the letters that are short. A pattern (never repeating, stepping, long runs) is then
 * broken by re-dealing the movable questions' positions at random, which keeps the counts. `spreadExtras` gives the odd questions (n not divisible
 * by the option count) to random letters instead of the most used ones: a few more moves, but many small banks (the notes) then come out even
 * together too. Returns the new list (unchanged questions are the same objects) and the moves made as { index, from, to }.
 */
export function balanceBank(questions, { seed = "", force = false, spreadExtras = false } = {}) {
  const list = Array.isArray(questions) ? questions : [];
  const before = auditBank(list);
  if (!force && !before.issues.length) return { questions: list, moves: [], before, after: before };
  const rand = seededRandom(`positions:${seed}`);
  const out = [...list];
  const pos = new Map();   // index -> current answer position
  list.forEach((q, i) => { const a = correctIndex(q); if (isMcq(q) && a.index >= 0) pos.set(i, a.index); });
  const movable = list.map((q, i) => (canMove(q) ? i : -1)).filter((i) => i >= 0);

  // 1) counts: per option count, every letter gets floor(n/k) or one more; the extra ones go to letters that already have most (fewest moves)
  const ks = [...new Set([...pos.keys()].map((i) => list[i].options.length))].filter((k) => k >= 3);
  for (const k of ks) {
    const members = [...pos.keys()].filter((i) => list[i].options.length === k);
    const counts = Array.from({ length: k }, () => 0);
    members.forEach((i) => { counts[pos.get(i)] += 1; });
    const base = Math.floor(members.length / k);
    const extra = members.length % k;
    const tieBreak = shuffled([...Array(k).keys()], rand);
    // counts that are already as even as they can be stay as they are (so running this again changes nothing)
    if (counts.every((c) => c === base || c === base + 1)) continue;
    const quota = Array.from({ length: k }, () => base);
    (spreadExtras ? tieBreak : [...tieBreak].sort((a, b) => counts[b] - counts[a])).slice(0, extra).forEach((p) => { quota[p] += 1; });
    const deficits = shuffled([...Array(k).keys()].flatMap((p) => Array(Math.max(0, quota[p] - counts[p])).fill(p)), rand);
    for (let p = 0; p < k && deficits.length; p++) {
      const surplus = counts[p] - quota[p];
      if (surplus <= 0) continue;
      const movers = shuffled(movable.filter((i) => list[i].options.length === k && pos.get(i) === p), rand).slice(0, surplus);
      for (const i of movers) {
        if (!deficits.length) break;
        pos.set(i, deficits.pop());
      }
    }
  }

  // 2) order: re-deal the movable positions at random until no pattern is left (the counts do not change)
  const patterned = (a) => a.issues.some((x) => x === "never-repeats" || x === "stepping-pattern" || x === "long-run");
  const apply = () => out.map((q, i) => (pos.has(i) && pos.get(i) !== correctIndex(list[i]).index ? moveAnswer(list[i], pos.get(i)) : list[i]));
  let next = apply();
  let audit = auditBank(next);
  for (let tries = 0; tries < 40 && patterned(audit); tries++) {
    for (const k of ks) {
      const idx = movable.filter((i) => list[i].options.length === k);
      const dealt = shuffled(idx.map((i) => pos.get(i)), rand);
      idx.forEach((i, j) => pos.set(i, dealt[j]));
    }
    next = apply();
    audit = auditBank(next);
  }
  const moves = [];
  list.forEach((q, i) => { if (next[i] !== q) moves.push({ index: i, from: correctIndex(q).index, to: correctIndex(next[i]).index }); });
  return { questions: next, moves, before, after: audit };
}

/**
 * Positions for freshly written questions (an AI reply, an import). All of them are dealt from one shuffled deck that holds every letter equally often,
 * rather than one die per question, so even a 12-question bank comes out even, with no fixed block or rhythm to learn. `existing` (questions already in
 * the bank) is counted first, so a top-up fills the letters the bank is short of.
 */
export function placeNewQuestions(questions, { rand = Math.random, existing = [] } = {}) {
  const list = Array.isArray(questions) ? questions : [];
  const have = new Map();
  for (const q of existing) {
    const a = correctIndex(q);
    if (!isMcq(q) || a.index < 0) continue;
    const k = q.options.length;
    if (!have.has(k)) have.set(k, Array.from({ length: k }, () => 0));
    have.get(k)[a.index] += 1;
  }
  const want = new Map();
  list.forEach((q) => { if (canMove(q)) want.set(q.options.length, (want.get(q.options.length) || 0) + 1); });
  const decks = new Map();
  for (const [k, m] of want) {
    const counts = have.get(k) || Array.from({ length: k }, () => 0);
    const quota = Math.ceil((counts.reduce((s, c) => s + c, 0) + m) / k);
    const deck = shuffled([...Array(k).keys()].flatMap((p) => Array(Math.max(0, quota - counts[p])).fill(p)), rand);
    decks.set(k, deck.slice(0, m));
  }
  return list.map((q) => (canMove(q) ? moveAnswer(q, decks.get(q.options.length).pop()) : q));
}

/** One random order of a question's options for display (the answer key moves with them). Questions whose order matters are returned as they are. */
export function shuffleQuestionOptions(q, rand = Math.random) {
  if (!canMove(q)) return q;
  const { index } = correctIndex(q);
  const order = shuffled(q.options.map((_, i) => i), rand);
  const options = order.map((i) => q.options[i]);
  const out = { ...q, options, correct_answer: order.indexOf(index) };
  if (Object.prototype.hasOwnProperty.call(q, "correct_answer_text")) out.correct_answer_text = options[out.correct_answer];
  return out;
}

/**
 * Checks that a rebalanced bank is the same bank: the same questions in the same order, every field other than the option order and answer pointer
 * unchanged, the same options, the same right answer text, and no order-sensitive or doubtful question moved. Returns a list of problems (empty = safe).
 */
export function validateBankChange(before, after) {
  const problems = [];
  if (!Array.isArray(before) || !Array.isArray(after)) return ["not a list"];
  if (before.length !== after.length) return [`question count changed ${before.length} -> ${after.length}`];
  before.forEach((b, i) => {
    const a = after[i];
    if (a === b) return;
    if (!isMcq(b) || !isMcq(a)) { problems.push(`#${i + 1}: not a multiple-choice question`); return; }
    const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
    for (const k of keys) {
      if (k === "options" || k === "correct_answer" || k === "correct_answer_text") continue;
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) problems.push(`#${i + 1}: field "${k}" changed`);
    }
    if (JSON.stringify([...a.options].sort()) !== JSON.stringify([...b.options].sort())) problems.push(`#${i + 1}: options changed`);
    const ca = correctIndex(a), cb = correctIndex(b);
    if (cb.index < 0 || ca.index < 0 || a.options[ca.index] !== b.options[cb.index]) problems.push(`#${i + 1}: right answer changed`);
    if (ca.problem) problems.push(`#${i + 1}: answer pointer inconsistent after the move (${ca.problem})`);
    if (JSON.stringify(a.options) !== JSON.stringify(b.options) && !canMove(b)) problems.push(`#${i + 1}: an order-sensitive or doubtful question was moved`);
  });
  return problems;
}
