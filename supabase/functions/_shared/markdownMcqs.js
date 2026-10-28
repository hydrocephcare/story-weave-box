// Multiple-choice questions written inside a note or blog post in the site's own format:
//   Question 3
//   A 30-year-old woman ... ?
//   A. First option
//   B. Second option
//   ...
//   Answer: B. Second option
//   Explanation: ...
// Shared by the admin content-health tool (src/lib/contentHealth.ts) and scripts/mcq/answer-positions.mjs, with the answer-position rules of
// mcqPositions.js: options are moved, the right answer never changes, and questions whose order means something stay as written.
import { auditBank, balanceBank } from "./mcqPositions.js";

const LETTERS = "ABCDE";
const SPLIT = /\n(?=(?:#{1,4}\s*)?\**Question\s+\d+\b)/;
const HEAD = /^(?:#{1,4}\s*)?\**Question\s+\d+/;
const OPT = /^([A-E])\. (\S.*)$/;
const ANS = /^(Answer:\s*)([A-E])\b(.*)$/;

/** Every question block of a post that can be read safely, as data, with where its lines are. */
export function readArticleQuestions(content) {
  const parts = String(content ?? "").replace(/\r/g, "").split(SPLIT);
  const blocks = [];
  let skipped = 0;
  parts.forEach((p, part) => {
    if (!HEAD.test(p)) return;
    const lines = p.split("\n");
    const idx = [];
    lines.forEach((l, i) => { if (OPT.test(l)) idx.push(i); });
    const ans = lines.findIndex((l) => ANS.test(l));
    const letters = idx.map((i) => lines[i][0]).join("");
    if (idx.length < 3 || ans < 0 || ans < idx[idx.length - 1] || letters !== LETTERS.slice(0, idx.length)) { skipped++; return; }
    const opts = idx.map((i) => lines[i].match(OPT)[2].trim());
    if (opts.some((o) => o.length > 220)) { skipped++; return; }
    const m = lines[ans].match(ANS);
    const ci = LETTERS.indexOf(m[2]);
    if (ci < 0 || ci >= opts.length) { skipped++; return; }
    const stem = lines.slice(1, idx[0]).join(" ").trim() || lines[0].replace(HEAD, "").replace(/^[*:.)\s-]+/, "").trim();
    // the explanation without the "Answer: B." label itself (that letter is rewritten with the move)
    const explanation = [m[3].replace(/^[.:)\s]+/, ""), ...lines.slice(ans + 1)].join(" ").trim();
    blocks.push({ part, idx, ans, q: { question: stem, options: opts, correct_answer: ci, explanation } });
  });
  return { parts, blocks, skipped };
}

/** The answer-position report of one post (counts per letter and patterns, never the answers). */
export const auditArticle = (content) => auditBank(readArticleQuestions(content).blocks.map((b) => b.q));

/**
 * The same post with its answer letters evened out. `force` evens out any post (the admin's "Balance the answer letters" button); without it only a
 * post with a pattern is changed. Returns the new content, how many questions were moved and how many were left alone.
 */
export function balanceArticleLetters(seed, content, { force = true } = {}) {
  const { parts, blocks, skipped } = readArticleQuestions(content);
  const qs = blocks.map((b) => b.q);
  const plan = balanceBank(qs, { seed: `article:${seed}`, force });
  const out = [...parts];
  for (const mv of plan.moves) {
    const b = blocks[mv.index];
    const before = qs[mv.index], after = plan.questions[mv.index];
    const lines = out[b.part].split("\n");
    b.idx.forEach((li, k) => { lines[li] = `${LETTERS[k]}. ${after.options[k]}`; });
    lines[b.ans] = lines[b.ans].replace(ANS, (_, label, _letter, rest) => `${label}${LETTERS[after.correct_answer]}${rest}`);
    if (after.options[after.correct_answer] !== before.options[before.correct_answer]) throw new Error("answer changed");
    out[b.part] = lines.join("\n");
  }
  // left alone: blocks that could not be read safely, and questions whose option order means something
  return { content: plan.moves.length ? out.join("\n") : String(content ?? ""), changed: plan.moves.length, skipped: skipped + plan.before.fixed, before: plan.before, after: plan.after };
}
