// Which multiple-choice questions are fit to show on a topic page. Some stored sets are damaged by importing: the real answer was replaced by a piece of
// the explanation, an "Answer:" label leaked into an option, or the answer number points at the wrong option. Showing those teaches students the wrong thing.

const LEAK = /\banswers?\s*[:\-]/i;

/** One option is a clean, short, finished piece of text. */
export function soundOption(o) {
  const t = String(o ?? "").replace(/\s+/g, " ").trim();
  if (t.length < 1 || t.length > 150) return false; // an option that is a whole sentence of explanation is a damaged one
  if (LEAK.test(t)) return false;                   // "permissive Answer:"
  if (/(\u2026|\.\.\.)\s*$/.test(t)) return false;  // cut off in the middle
  if (/^[*\-_\s]+$/.test(t)) return false;
  return true;
}

/** A whole question is fit to show: a real stem, at least three clean different options, and an answer number that points at one of them. */
export function soundQuestion(q) {
  if (!q || typeof q.question !== "string" || q.question.trim().length < 12) return false;
  const opts = Array.isArray(q.options) ? q.options : [];
  if (opts.length < 3 || opts.length > 6) return false;
  if (!opts.every(soundOption)) return false;
  const norm = opts.map((o) => String(o).toLowerCase().replace(/[^a-z0-9]+/g, ""));
  if (new Set(norm).size !== norm.length) return false;
  if (!Number.isInteger(q.correct_answer) || q.correct_answer < 0 || q.correct_answer >= opts.length) return false;
  return true;
}

/** The same question stored in many copies is one question: this is the key that tells them apart from different ones. */
export const stemKey = (q) => String(q?.question ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 90);

/** An explanation without import debris ("---", a lone "*"). */
export function cleanExplanation(e) {
  return String(e ?? "").replace(/\s*(-{3,}|\*+)\s*$/g, "").trim();
}
