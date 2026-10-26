// Reads a past-paper or MCQ post written as markdown and finds every question that has no answer yet.
// Used by answer-papers.mjs. Pure functions, no network.
//
//   MCQ  : a stem, then a run of option lines "a) ...", "A. ..." or "(a) ...", then (when answered) an "Answer: ..." line.
//   Written: "**3.** question" / "**Question 3.** question" / "### Question 3" blocks in a paper, answered with an "Answer:" line and points.

export const OPT = /^\s*\(?([a-eA-E])[.)]\s+(\S.*)$/;
const ANSWERED = /^\s*[*_✅✔☑👉\s]*(answer|ans|correct answer|model answer)\b/i;
const QSTART = /^\s*(?:#{1,4}\s*)?(?:\*\*)?\s*(?:Question\s*|Q\s*)?(\d{1,3})\s*[.)]?\s*(?:\*\*)?\s*[.):]?\s*(?:\*\*)?\s*(.*)$/i;

/** Splits the post into lines and finds the MCQs (stem line index, option line indexes, answer line index or -1). */
export function findMcqs(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(OPT);
    if (!m || m[1].toLowerCase() !== "a") continue;
    let j = i; const opts = [];
    let want = "a";
    while (j < lines.length) {
      const o = lines[j].match(OPT);
      if (o && o[1].toLowerCase() === want) { opts.push({ line: j, letter: want, text: o[2].trim() }); want = String.fromCharCode(want.charCodeAt(0) + 1); j++; continue; }
      if (!lines[j].trim() && j + 1 < lines.length && lines[j + 1].match(OPT)?.[1].toLowerCase() === want) { j++; continue; }
      break;
    }
    if (opts.length < 3) { i = Math.max(i, j - 1); continue; }
    // lettered parts that carry marks, (a) ... (15 marks), belong to a written question, not to a multiple-choice one
    if (opts.filter((o) => /\(\d{1,2}(?:\s*\+\s*\d{1,2})*\s*marks?\)/i.test(o.text)).length >= Math.ceil(opts.length / 2)) { i = j - 1; continue; }
    if (opts.filter((o) => /^(what|describe|explain|mention|enumerate|discuss|list|state|outline|define|give|name|how|why|write|draw|classify|compare|differentiate|identify)\b/i.test(o.text)).length >= Math.ceil(opts.length / 2)) { i = j - 1; continue; }
    // true/false statements already marked in the option text, e.g. "... – **True**", are answered in place
    if (opts.filter((o) => /\*\*\s*(true|false|t|f)\b/i.test(o.text)).length >= Math.ceil(opts.length / 2)) { i = j - 1; continue; }
    // stem: the nearest non-blank line(s) above the run
    let s = i - 1; while (s >= 0 && !lines[s].trim()) s--;
    let stemStart = s;
    while (stemStart - 1 >= 0 && lines[stemStart - 1].trim() && !/^\s*(#{1,6}\s|---)/.test(lines[stemStart - 1]) && !QSTART.test(lines[stemStart]) ) stemStart--;
    const stem = lines.slice(stemStart, s + 1).join(" ").replace(/^\s*(?:#{1,4}\s*)?\*{0,2}\s*(?:Question\s*)?\d{1,3}\s*[.)]?\s*\*{0,2}\s*[.):]?\s*\*{0,2}\s*/i, "").replace(/\*\*/g, "").trim();
    if (/^answer\s*:?$/i.test(stem)) { i = j - 1; continue; } // the lettered parts of a written answer, not a question
    // answer: within the next few non-blank lines after the last option
    let k = j; let ans = -1;
    for (let seen = 0; k < lines.length && seen < 4; k++) { if (!lines[k].trim()) continue; seen++; if (ANSWERED.test(lines[k])) { ans = k; break; } if (OPT.test(lines[k]) || QSTART.test(lines[k]) && /^\s*(?:#{1,4}\s*)?\*\*/.test(lines[k])) break; }
    out.push({ stemLine: stemStart, stemEnd: s, stem, opts, lastOpt: opts[opts.length - 1].line, answerLine: ans, number: (lines[stemStart].match(QSTART) || [])[1] ?? null });
    i = j - 1;
  }
  return { lines, mcqs: out };
}

/** Section headings that start the written parts of a paper. */
const WRITTEN_HEAD = /^\s*#{1,4}\s*(?:section\s*)?[bc]\b.*|^\s*#{1,4}\s*.*(short answer|essay|long answer|saq|laq)/i;

/** Written questions: a bold numbered line (or "Question N") with no "Answer" line before the next one. Only looked for after a written-section heading. */
export function findWritten(text, mcqs) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const used = new Set(); for (const q of mcqs) for (let x = q.stemLine; x <= q.lastOpt; x++) used.add(x);
  let inWritten = false; const starts = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*#{1,4}\s/.test(lines[i])) inWritten = WRITTEN_HEAD.test(lines[i]) || (inWritten && !/multiple choice|mcq/i.test(lines[i]));
    if (!inWritten || used.has(i)) continue;
    const m = lines[i].match(/^\s*\*\*\s*(?:Question\s*)?(\d{1,3})\s*[.)]?\s*\*\*\s*(.*)$/i) || lines[i].match(/^\s*(?:#{2,4}\s*)?Question\s+(\d{1,3})\s*[.:)]?\s*(.*)$/i);
    if (m) starts.push({ line: i, number: m[1], first: m[2] });
  }
  const out = [];
  for (let n = 0; n < starts.length; n++) {
    const from = starts[n].line;
    let to = (starts[n + 1]?.line ?? lines.length) - 1;
    for (let x = from + 1; x <= to; x++) if (/^\s*(#{1,3}\s|---\s*$)/.test(lines[x])) { to = x - 1; break; }
    while (to > from && !lines[to].trim()) to--;
    const block = lines.slice(from, to + 1);
    const answered = block.slice(1).some((l) => /^\s*[*_]*\s*(answer|model answer)\b\s*[:*]/i.test(l));
    const body = block.join("\n").replace(/^\s*(?:#{1,4}\s*)?\*\*\s*(?:Question\s*)?\d{1,3}\s*[.)]?\s*\*\*\s*/i, "").trim();
    // an answer that was typed in without an "Answer:" label still counts: a long text after a short question is an answer
    const firstLen = (block[0] || "").length, rest = block.slice(1).join(" ").replace(/\s+/g, " ").trim().length;
    out.push({ from, to, number: starts[n].number, body, answered: answered || rest > 260 || (rest > 120 && firstLen < 140 && !/^\s*\(?[a-e][.)]/i.test(block[1] || "")), marks: [...body.matchAll(/\((\d{1,2})(?:\s*\+\s*\d{1,2})*\s*marks?\)/gi)].reduce((a, m) => a + Number(m[1]), 0) });
  }
  return out;
}

export function summarise(text) {
  const { mcqs } = findMcqs(text);
  const written = findWritten(text, mcqs);
  return {
    mcq: mcqs.length, mcqUnanswered: mcqs.filter((q) => q.answerLine < 0).length,
    written: written.length, writtenUnanswered: written.filter((w) => !w.answered).length,
  };
}
