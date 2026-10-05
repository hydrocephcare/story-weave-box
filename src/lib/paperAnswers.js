// Past-paper notes are written as question, then answer. The site's default for questions is that the
// question is always visible and the answer sits behind a "Reveal" button for subscribers. This splits a
// paper's markdown into visible parts and answer parts so the page can do that.
//
// The notes use a few layouts, and one rule covers each:
//   - a heading that is a question ("Question 3", "(b) ...", "12. stem", "Case 2 ..."); its body is the answer,
//     except that multiple-choice options stay visible and the answer starts after the last option;
//   - a heading that has question sub-headings under it; its body is the stem and stays visible;
//   - a "### Answer" heading (everything after it, up to the next heading or rule, is the answer);
//   - bold "(a) question (3 marks)" lines followed by their answers.
// Plain JavaScript so a build script and the browser can share it.

const HEADING = /^(#{1,4})\s+(.*)$/;
const QUESTION_HEADING = /^(Question\s*\d+|Q\s*\d+\b|Case\s*\d+|\d+[.)]\s|\d+\([a-z]{1,4}\)[.)]?\s|\([a-z]{1,4}\)|\((?:i{1,3}|iv|v|vi{1,3}|ix|x)\))/i;
const MARKS = /\(\d+\s*marks?\)/i;
const SUMMARY = /answers? at a glance|answer key|rapid revision/i;
const OPTION = /^\s*(?:[-*]\s+)?\(?[A-E][.)]\s+\S/;
const BOLD_QUESTION = /^\*\*\(([a-z]{1,4}|\d{1,2})\)\s.*\*\*\s*$/i;

const isBlank = (l) => !l.trim();
const isRule = (l) => /^-{3,}\s*$/.test(l);

/** Returns [{ hidden: boolean, text: string }] in reading order. */
export function splitPaper(source) {
  const lines = String(source).replace(/\r\n/g, "\n").split("\n");
  const kind = new Array(lines.length).fill("show"); // "show" | "hide" | "drop"

  // Index every heading once, so a question heading can look at what comes next.
  const heads = [];
  lines.forEach((l, i) => { const m = l.match(HEADING); if (m) heads.push({ i, level: m[1].length, text: m[2] }); });
  const nextHeadAfter = (i) => heads.find((h) => h.i > i) ?? null;

  const hideRange = (from, to) => { for (let k = from; k < to; k++) if (!isBlank(lines[k]) && kind[k] !== "drop") kind[k] = "hide"; };

  heads.forEach((h, hi) => {
    const next = heads[hi + 1] ?? null;
    const bodyStart = h.i + 1;
    let bodyEnd = next ? next.i : lines.length;
    // A rule ends an answer too.
    for (let k = bodyStart; k < bodyEnd; k++) if (isRule(lines[k])) { bodyEnd = k; break; }

    if (/^answer\b/i.test(h.text)) {
      // An answer can have its own sub-headings ("Definition", "Management"); it runs to the next question or section.
      kind[h.i] = "drop";
      let end = lines.length;
      for (const x of heads) if (x.i > h.i && (x.level <= 2 || QUESTION_HEADING.test(x.text) || MARKS.test(x.text))) { end = x.i; break; }
      for (let k = bodyStart; k < end; k++) if (isRule(lines[k])) { end = k; break; }
      hideRange(bodyStart, end);
      return;
    }
    if (SUMMARY.test(h.text)) {
      let end = lines.length;
      for (const x of heads) if (x.i > h.i && x.level <= h.level) { end = x.i; break; }
      hideRange(bodyStart, end);
      return;
    }
    // A sub-heading under "Case 3" or "Question 2" is a part of that question, even without "(a)" or a mark count.
    const parent = h.level >= 3 ? [...heads].slice(0, hi).reverse().find((x) => x.level < h.level) : null;
    const partOfQuestion = Boolean(parent && QUESTION_HEADING.test(parent.text));
    if (!QUESTION_HEADING.test(h.text) && !MARKS.test(h.text) && !partOfQuestion) return;

    // The question has sub-questions under it: its own text is the stem, which stays visible.
    if (next && next.level > h.level && (QUESTION_HEADING.test(next.text) || /^answer\b/i.test(next.text))) return;

    // Multiple choice: everything up to the last option stays visible, the rest is the answer.
    let lastOption = -1;
    for (let k = bodyStart; k < bodyEnd; k++) if (OPTION.test(lines[k])) lastOption = k;
    if (lastOption >= 0) { hideRange(lastOption + 1, bodyEnd); return; }

    // Bold "(a) question" lines: each one is visible, the lines after it are its answer.
    const firstText = lines.slice(bodyStart, bodyEnd).find((l) => !isBlank(l));
    if (firstText && BOLD_QUESTION.test(firstText.trim())) {
      let inAnswer = false;
      for (let k = bodyStart; k < bodyEnd; k++) {
        if (isBlank(lines[k])) continue;
        if (BOLD_QUESTION.test(lines[k].trim())) { inAnswer = true; continue; }
        if (inAnswer) kind[k] = "hide";
      }
      return;
    }

    // Otherwise the body is the answer, apart from a leading "Given:" or quoted stem.
    let k = bodyStart;
    while (k < bodyEnd && (isBlank(lines[k]) || /^>/.test(lines[k]) || /^\*\*(Given|Case|Stem|Scenario|Note)\b/i.test(lines[k]))) k++;
    hideRange(k, bodyEnd);
  });

  const out = [];
  let buf = [];
  let hidden = false;
  const flush = () => { const text = buf.join("\n").trim(); if (text) out.push({ hidden, text }); buf = []; };
  lines.forEach((l, i) => {
    if (kind[i] === "drop") return;
    // Blank lines and rules belong to whichever part they sit inside.
    const h = kind[i] === "hide";
    if (isBlank(l)) { buf.push(l); return; }
    if (h !== hidden) { flush(); hidden = h; }
    buf.push(l);
  });
  flush();
  return out;
}
