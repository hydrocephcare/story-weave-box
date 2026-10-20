// Multiple-choice questions that cannot be passed by guessing. A question is "weak" when its answer gives itself away: the right option is the longest or most
// detailed, a wrong option carries an absolute word ("always", "only"), or the stem is a bare "What is X?". Weak questions are rewritten as short clinical
// scenarios with wrong options that are real alternatives of the same kind and the same length; a rewrite is accepted only if it still tests the same fact.
import { chatText } from "./aiChat.js";

const ABSOLUTE = /\b(always|never|only|completely|entirely|invariably|exclusively|solely)\b/i;
const SCENARIO = /(year[- ]old|presents|presented|brought|complains|admitted|examination|on examination|history of|found to)/i;
const words = (t) => new Set(String(t).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 3));

/** Why this question can be guessed, as a list of short reasons (empty when it is fine). Only four-option questions are judged. */
export function weakness(q) {
  const o = Array.isArray(q?.options) ? q.options.map((x) => String(x)) : [];
  if (o.length !== 4 || !Number.isInteger(q.correct_answer) || q.correct_answer < 0 || q.correct_answer > 3) return [];
  const lens = o.map((x) => x.length), c = lens[q.correct_answer];
  const others = lens.filter((_, i) => i !== q.correct_answer);
  const mean = lens.reduce((a, b) => a + b, 0) / 4;
  const why = [];
  if (c > Math.max(...others) * 1.12 && c - Math.max(...others) >= 6) why.push("longest");
  if (c >= mean * 1.3) why.push("detailed");
  if (o.some((x, i) => i !== q.correct_answer && ABSOLUTE.test(x)) && !ABSOLUTE.test(o[q.correct_answer])) why.push("absolute");
  const stem = String(q.question || "");
  if (stem.length < 70 && /^(what|which)\b/i.test(stem.trim()) && !SCENARIO.test(stem)) why.push("recall");
  // the right option repeats most of the stem's own words (a giveaway)
  const sw = words(stem), cw = words(o[q.correct_answer]);
  if (cw.size >= 3) { let n = 0; for (const w of cw) if (sw.has(w)) n++; if (n / cw.size >= 0.75) why.push("echo"); }
  return why;
}

export const isSkippable = (q) => /!\[|figure|image|picture|shown|diagram|slide|table above|option [a-e]\b|\b[a-e] and [a-e]\b/i.test(`${q?.question || ""} ${(q?.options || []).join(" ")}`);

const SYSTEM = `You are a medical examiner improving multiple-choice questions so they cannot be answered by guessing. You receive questions that give their answer away. Rewrite each one.
For every question:
- KEEP the same tested fact and the same correct answer. Do not change what is true.
- Stem: a short clinical scenario (age, presentation, one or two findings) when the topic allows, ending in a precise question (most likely diagnosis, mechanism, best next step, drug of choice, most likely finding). When a scenario does not fit, ask a precise reasoning question, never a bare "What is X?".
- Exactly four options. All four are the same kind of thing and written in the same form. Their lengths are within about 15% of each other; the correct option is NOT the longest and NOT the most specific.
- The three wrong options are plausible alternatives a student could genuinely confuse with the right one: neighbouring diagnoses, other drugs of the same class, the next or previous step. Never absurd, never a joke, never a different subject, never containing "always", "never", "only", "all", "none". No option contains or repeats another. If a wrong option in the original is implausible (a drug, finding or step that belongs to an unrelated disease), REPLACE it with a believable alternative from the same area instead of keeping it.
- No "all of the above" or "none of the above". Do not name letters.
- The explanation is two sentences at most: why the answer is right, and why the closest wrong option is not.
Return ONLY JSON: {"items":[{"i":0,"question":"...","options":["...","...","...","..."],"correct_answer":0,"explanation":"..."}]} with one item per input question, "i" being the number you were given.`;

const lengthsOk = (opts, ci) => {
  const lens = opts.map((x) => x.length), c = lens[ci];
  const others = lens.filter((_, i) => i !== ci);
  return c <= Math.max(...others) * 1.2 + 4 && c >= Math.min(...others) * 0.55;
};

/** Rewrites the given weak questions in one request. Returns an array the same length as `qs`: the better question, or null where the rewrite was not good enough. */
export async function hardenBatch(env, qs, { subject = "", manual = false, stats = {} } = {}) {
  const no = (why) => { stats[why] = (stats[why] || 0) + 1; };
  if (!qs.length) return [];
  const body = qs.map((q, i) => `#${i}\nQUESTION: ${q.question}\nOPTIONS: ${q.options.map((o, k) => `${String.fromCharCode(65 + k)}) ${o}`).join(" | ")}\nCORRECT: ${String.fromCharCode(65 + q.correct_answer)}\nEXPLANATION: ${q.explanation || ""}`).join("\n\n");
  const raw = await chatText(env, [{ role: "system", content: SYSTEM }, { role: "user", content: `Subject: ${subject}\n\n${body}` }], { temperature: 0.5, maxTokens: 6000, timeoutMs: 80000, manual });
  const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
  let items = [];
  try { items = JSON.parse(raw.slice(a, b + 1)).items || []; } catch { return qs.map(() => null); }
  const out = qs.map(() => null);
  for (const it of items) {
    const i = Number(it?.i);
    if (!Number.isInteger(i) || i < 0 || i >= qs.length) { no("badIndex"); continue; }
    const old = qs[i];
    const options = Array.isArray(it.options) ? it.options.map((x) => String(x).trim()) : [];
    const ci = Number(it.correct_answer);
    if (options.length !== 4 || options.some((x) => !x) || !Number.isInteger(ci) || ci < 0 || ci > 3) { no("shape"); continue; }
    if (new Set(options.map((x) => x.toLowerCase())).size !== 4 || options.some((x) => /all of the above|none of the above/i.test(x))) { no("dupOrAll"); continue; }
    if (!lengthsOk(options, ci)) { no("length"); continue; }
    // the same fact: the new right option must share enough words with the old right option (or the old explanation)
    const oldWords = words(`${old.options[old.correct_answer]}`), newWords = words(options[ci]);
    let shared = 0; for (const w of oldWords) if (newWords.has(w)) shared++;
    const ratio = oldWords.size ? shared / Math.min(oldWords.size, Math.max(newWords.size, 1)) : 0;
    const exp = words(`${old.explanation || ""} ${old.question}`); let inExp = 0; for (const w of newWords) if (exp.has(w)) inExp++;
    if (ratio < 0.34 && !(newWords.size && inExp / newWords.size >= 0.5)) { no("otherFact"); continue; }
    // the right answer must not sit in a predictable place
    const idx = [0, 1, 2, 3];
    for (let k = 3; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [idx[k], idx[j]] = [idx[j], idx[k]]; }
    const cand = { ...old, question: String(it.question || "").trim(), options: idx.map((k) => options[k]), correct_answer: idx.indexOf(ci), explanation: String(it.explanation || old.explanation || "").trim() };
    if (cand.question.length < 20) { no("shortStem"); continue; }
    const wk = weakness(cand).filter((w) => w !== "recall");
    if (wk.length) { no("stillWeak:" + wk.join("+")); continue; }
    no("accepted"); out[i] = cand;
  }
  return out;
}
