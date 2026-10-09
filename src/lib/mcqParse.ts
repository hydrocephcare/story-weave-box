// Turns pasted MCQ text (usually from ChatGPT) into question objects. It understands the many ways ChatGPT writes them: "1.", "Q1)", "**Question 1:**",
// options as "A.", "A)", "(a)", "**A.**" or all on one line, and answers as "Answer: B", "**Answer:** B", "Correct answer: (B) text" or "Ans - B".
// A question with no answer, or with an answer that is not one of the options, is skipped and reported, never guessed.
export interface ParsedMcq { question: string; options: string[]; correct_answer: number; explanation?: string }
export interface McqParseResult { questions: ParsedMcq[]; skipped: { n: string; why: string }[] }

const strip = (l: string) => l.replace(/^[\s>*_#]+/, "").replace(/[*_]+\s*$/g, "").trim();
const START = /^(?:(?:question|q)\s*\.?\s*)?(\d{1,3})\s*[.):\-–—]\s*\**\s*(.*)$/i;
const START_WORD = /^(?:question|q)\s*\.?\s*(\d{1,3})\s*[.):\-–—]?\s*\**\s*(.*)$/i;
const OPTION = /^\(?([A-Ea-e])[.)]\)?\s*\**\s*(\S.*)$/;
const ANSWER = /^(?:✅\s*)?(?:correct\s+answer|correct|answer|ans|key)\s*(?:is)?\s*[:：\-–—]?\s*\(?([A-Ea-e])\)?(?![A-Za-z])\s*[.:)\-–—]?\s*(.*)$/i;
const ANSWER_TEXT = /^(?:✅\s*)?(?:correct\s+answer|answer|ans)\s*[:：\-–—]\s*(.+)$/i;
const EXPLAIN = /^(?:💡\s*)?(?:explanation|rationale|reasoning|why)\s*[:：\-–—]?\s*(.*)$/i;

function splitInline(line: string): string[] {
  const parts = line.split(/\s+(?=\(?[A-Ea-e][.)]\s+\S)/);
  return parts.length >= 3 && parts.every((p) => OPTION.test(p.trim())) ? parts.map((p) => p.trim()) : [line];
}

interface Draft { n: string; stem: string[]; options: string[]; letter: string | null; answerText: string | null; explanation: string[] }

export function parseMcqText(raw: string): McqParseResult {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n").flatMap((l) => splitInline(l));
  const drafts: Draft[] = [];
  let cur: Draft | null = null;
  let inExp = false;
  const numbered = lines.some((l) => START.test(strip(l)) && !OPTION.test(strip(l)));

  const begin = (n: string, stem: string) => { cur = { n, stem: stem ? [stem] : [], options: [], letter: null, answerText: null, explanation: [] }; drafts.push(cur); inExp = false; };

  for (const original of lines) {
    const l = strip(original);
    if (!l) { if (!numbered && cur && (cur.options.length || cur.letter)) cur = null; continue; }
    if (/^#{0,6}\s*(?:mcqs?|multiple choice|section|references?)\b/i.test(original.trim()) && !START.test(l)) continue;
    const opt = l.match(OPTION);
    const isStart = !opt && (numbered ? START.test(l) || START_WORD.test(l) : false);
    const wordStart = !opt && l.match(START_WORD);
    if (isStart || (wordStart && !cur?.options.length && !numbered)) {
      const m = l.match(START) ?? l.match(START_WORD)!;
      begin(m[1], (m[2] ?? "").replace(/\*+/g, "").trim());
      continue;
    }
    if (!cur) { if (!numbered && !opt && !ANSWER.test(l) && !EXPLAIN.test(l)) begin(String(drafts.length + 1), l.replace(/\*+/g, "")); continue; }
    const c: Draft = cur;
    const ans = l.match(ANSWER);
    if (opt && !inExp) { c.options.push(opt[2].replace(/\*+/g, "").trim()); continue; }
    if (ans && !inExp) {
      c.letter = ans[1].toUpperCase();
      const tail = ans[2].trim();
      const ex = tail.match(/^(?:explanation|rationale|reasoning)\s*[:：\-–—]\s*(.*)$/i);
      if (ex) { c.explanation.push(ex[1]); inExp = true; } else if (tail.length > 25) { c.explanation.push(tail); inExp = true; }
      continue;
    }
    const ansText = !ans && l.match(ANSWER_TEXT);
    if (ansText && !inExp) { c.answerText = ansText[1].replace(/\*+/g, "").trim(); continue; }
    const exp = l.match(EXPLAIN);
    if (exp && (c.letter || c.answerText || c.options.length)) { inExp = true; if (exp[1]) c.explanation.push(exp[1].replace(/\*+/g, "")); continue; }
    if (inExp) c.explanation.push(l.replace(/\*+/g, ""));
    else if (!c.options.length) c.stem.push(l.replace(/\*+/g, ""));
    else c.options[c.options.length - 1] += ` ${l.replace(/\*+/g, "")}`; // a wrapped option
  }

  const questions: ParsedMcq[] = [];
  const skipped: McqParseResult["skipped"] = [];
  const seen = new Set<string>();
  for (const d of drafts) {
    const question = d.stem.join(" ").replace(/\s+/g, " ").trim();
    if (!question && !d.options.length) continue;
    if (question.length < 8) { skipped.push({ n: d.n, why: "no question text" }); continue; }
    if (d.options.length < 2) { skipped.push({ n: d.n, why: "fewer than two options" }); continue; }
    if (d.options.length < 4) { skipped.push({ n: d.n, why: `only ${d.options.length} options` }); continue; }
    let idx = d.letter ? d.letter.charCodeAt(0) - 65 : -1;
    if (idx < 0 && d.answerText) {
      const t = d.answerText.toLowerCase().replace(/^\(?[a-e][.)]\s*/, "").trim();
      idx = d.options.findIndex((o) => o.toLowerCase() === t || (t.length > 6 && o.toLowerCase().startsWith(t)));
    }
    if (idx < 0) { skipped.push({ n: d.n, why: "no answer given" }); continue; }
    if (idx >= d.options.length) { skipped.push({ n: d.n, why: `the answer ${d.letter} is not one of the ${d.options.length} options` }); continue; }
    const key = question.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) { skipped.push({ n: d.n, why: "repeats an earlier question" }); continue; }
    seen.add(key);
    const explanation = d.explanation.join(" ").replace(/\s+/g, " ").trim();
    questions.push({ question, options: d.options.slice(0, 5), correct_answer: idx, ...(explanation ? { explanation } : {}) });
  }
  return { questions, skipped };
}

/** Prompt for ChatGPT when the aim is an MCQ set (not a note). */
export const MCQ_SET_PROMPT = `Write multiple-choice questions for MBChB students in Kenya. Output only the questions, nothing before or after.

Use exactly this layout for every question, with a blank line between questions:

1. The question stem, ending with a question mark?
A. First option
B. Second option
C. Third option
D. Fourth option
Answer: C
Explanation: One to three sentences saying why C is right and why the others are not.

Rules:
- Number the questions 1, 2, 3...
- Exactly four options A to D, each on its own line. Only one is correct.
- Spread the correct answers evenly across A, B, C and D.
- Always write the "Answer:" line with a single letter, and an "Explanation:" line.
- Use clinical vignettes where it fits (age, sex, presentation) and standard textbook or Kenyan-guideline facts. If you are not sure of a fact, do not write the question.`;
