// The Ompath note standard: one layout for every note, so it reads well on a phone and on a desktop, and so the site can turn its questions into
// tap-to-reveal answers. This file holds (1) the prompt to give ChatGPT, (2) a checker that lists what is wrong with a note, (3) a tidy-up that
// repairs the usual ChatGPT mess, and (4) a match against the course outline (unit, topic and week). Pure functions, no network.
import { COURSE_OUTLINES, type CourseOutline, type OutlineItem } from "@/data/courseOutlines";

export type IssueLevel = "error" | "warn" | "tip";
export interface NoteIssue { level: IssueLevel; code: string; message: string; /** the tidy-up can repair this */ fixable?: boolean }
export interface NoteReport { issues: NoteIssue[]; mcqs: number; essays: number; recall: number; words: number; readMinutes: number; sections: number }

// ---------------------------------------------------------------------------------------------------------------------------------------
// 1. The prompt
// ---------------------------------------------------------------------------------------------------------------------------------------
export const NOTE_PROMPT = `You are writing study notes for Ompath Study, a website for Kenyan MBChB medical students. Write in Markdown and follow this layout exactly. Do not add any text outside the note: no greeting, no "Here is", no closing remarks.

TITLE LINE
Do not write a title heading. I will type the title myself.

SECTIONS
- Start with: ## Key points   (4 to 6 short bullets: the things to remember if the student reads nothing else).
- Then one "## " heading for each topic. Use "### " for sub-topics. Never use a single "# " heading.
- Write short paragraphs of at most 3 sentences. Prefer bullet points ("- ") for lists and features.
- Use a table (| a | b |) for comparisons, classifications, causes, drugs and doses.
- Bold the important terms: **like this**. Do not bold whole sentences.
- Mnemonics go in a quote line:  > Mnemonic: ...
- Warnings and exam tips go in a quote line:  > Exam tip: ...
- Do not use horizontal lines (---), emojis, HTML, or numbered headings like "1. Introduction".

PRACTICE QUESTIONS (always at the very end, in this order; each of the four parts is a "## " heading)

## Practice Questions

### Quick recall
1. Short question? → Short answer.
2. Short question? → Short answer.
(5 to 10 lines, each on one line, with the arrow →)

## MCQs
Question 1: The question stem goes here?
A. First option
B. Second option
C. Third option
D. Fourth option
**Answer:** B
**Explanation:** Why B is right and why the others are wrong, in 1 to 3 sentences.

Question 2: ...
(Write 10 MCQs. Every question has exactly 4 or 5 options labelled A. B. C. D. (E.) each on its own line, one correct answer, and an Explanation. Spread the correct answers across A to E. Write "Question 1:", "Question 2:" in plain text, not bold, not a heading.)

## Short answer questions
1. The question? (4 marks)
**Model answer:** The answer as 3 to 5 short points or a short paragraph.

## Essay questions
1. The question? (10 marks)
**Model answer:** The answer with sub-headings in bold and bullet points.

## References
- Book or guideline names, one per line.

Facts must be accurate and in line with standard textbooks and Kenyan guidelines. If you are not sure of a fact, leave it out.`;

// ---------------------------------------------------------------------------------------------------------------------------------------
// 2. Tidy-up
// ---------------------------------------------------------------------------------------------------------------------------------------
const CHAT_LEAD = /^(sure|certainly|of course|absolutely|great|okay|ok|here(?:'|’)?s|here is|here are|below is|below are|i(?:'|’)?ve|i have|i hope|hope this|let me know|feel free|would you like|do you want|if you(?:'|’)d like|as an ai)\b/i;
const OPT = /^\s*\(?([A-Ea-e])[.)]\)?\s+(\S.*)$/;
const isRule = (l: string) => /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(l);
const isTableLine = (l: string) => /^\s*\|/.test(l);

/** Splits "A) one B) two C) three" onto separate lines (only when three or more labels are on one line). */
function splitInlineOptions(line: string): string[] {
  const parts = line.split(/\s+(?=\(?[A-Ea-e][.)]\s+\S)/);
  if (parts.length >= 3 && parts.every((p) => OPT.test(p.trim()))) return parts.map((p) => p.trim());
  return [line];
}

/** Repairs the usual ChatGPT mess without changing any wording: layout only. */
export function tidyNote(input: string, title = ""): string {
  let text = input.replace(/\r\n?/g, "\n").replace(/ /g, " ").replace(/[ \t]+$/gm, "");
  let lines = text.split("\n");

  // greeting and sign-off lines
  const trimEdge = (arr: string[], fromStart: boolean) => {
    let guard = 0;
    while (arr.length && guard++ < 6) {
      const idx = fromStart ? arr.findIndex((l) => l.trim()) : arr.length - 1 - [...arr].reverse().findIndex((l) => l.trim());
      if (idx < 0 || idx >= arr.length) break;
      const l = arr[idx].trim().replace(/^[>*_\s]+|[*_\s]+$/g, "");
      if (CHAT_LEAD.test(l) && l.length < 220 && !/^#/.test(l)) arr.splice(idx, 1); else break;
    }
    return arr;
  };
  lines = trimEdge(trimEdge(lines, true), false);

  const out: string[] = [];
  let inFence = false;
  for (let raw of lines) {
    if (/^\s*```/.test(raw)) { inFence = !inFence; out.push(raw); continue; }
    if (inFence) { out.push(raw); continue; }
    if (isRule(raw)) continue;
    // bullets
    raw = raw.replace(/^(\s*)[•◦▪●‣·]\s+/, "$1- ").replace(/^(\s*)\*\s+(?!\*)/, "$1- ");
    // headings: no bold inside, no trailing colon, a single # becomes ##
    const h = raw.match(/^(#{1,6})\s*(.*?)\s*#*\s*$/);
    if (h && h[2]) {
      let level = h[1].length;
      let txt = h[2].replace(/^\*\*(.*)\*\*$/, "$1").replace(/^__(.*)__$/, "$1").replace(/\*\*/g, "").replace(/:$/, "").trim();
      txt = txt.replace(/^\d+\.\s+(?=[A-Za-z])/, ""); // "1. Introduction" -> "Introduction"
      if (level === 1) { if (title && txt.toLowerCase() === title.trim().toLowerCase()) continue; level = 2; }
      out.push(`${"#".repeat(level)} ${txt}`);
      continue;
    }
    // "text • one • two • three" on one line becomes a list
    const dots = raw.split(/\s+[•◦▪●‣]\s+/);
    if (dots.length >= 3) { if (dots[0].trim()) out.push(dots[0].trim(), ""); dots.slice(1).forEach((d) => out.push(`- ${d.trim()}`)); continue; }
    for (const piece of splitInlineOptions(raw)) out.push(piece);
  }
  lines = out;

  // question starts, options, answers
  const fixed: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    const bare = l.replace(/^#{1,6}\s+/, "").replace(/^[*_\s]+/, "");
    const q = bare.match(/^(?:Q(?:uestion)?)\s*\.?\s*(\d+)\s*[.):\-–—]*\s*\**\s*(.*)$/i);
    if (q && /^(?:#{1,6}\s+)?\**\s*(?:Q|Question)/i.test(l.trim())) {
      let stem = q[2].replace(/\*+$/g, "").trim();
      if (!stem) { const j = lines.findIndex((x, k) => k > i && x.trim()); if (j > i && !OPT.test(lines[j]) && !/^(?:#|\*\*?(?:answer|explanation))/i.test(lines[j].trim())) { stem = lines[j].trim().replace(/^\*+|\*+$/g, ""); lines[j] = ""; } }
      fixed.push(`Question ${q[1]}: ${stem}`.trimEnd());
      continue;
    }
    const opt = l.match(OPT);
    const next = lines.slice(i + 1).find((x) => x.trim());
    const prev = [...fixed].reverse().find((x) => x.trim());
    if (opt && (OPT.test(next ?? "") || (prev && (OPT.test(prev) || /^Question \d+:/.test(prev))))) { fixed.push(`${opt[1].toUpperCase()}. ${opt[2].trim().replace(/^\*\*(.*)\*\*$/, "$1")}`); continue; }
    const ans = l.match(/^\s*[*_>\s]*(?:✅|✔️?|☑️?)?\s*[*_]*(?:correct\s+answer|answer|ans|key)[*_]*\s*[:：\-–—]\s*[*_]*\s*\(?([A-Ea-e])\)?[*_]*[.:)]?\s*(.*)$/i);
    if (ans) { const tail = ans[2].replace(/^[-–—.:\s]+/, "").trim(); fixed.push(`**Answer:** ${ans[1].toUpperCase()}`); if (tail) { const m2 = tail.match(/^(?:explanation|rationale|reason)\s*[:：]\s*(.*)$/i); fixed.push(`**Explanation:** ${m2 ? m2[1] : tail}`); } continue; }
    const model = l.match(/^\s*[*_>\s]*(?:✅)?\s*[*_]*(model\s+answer|suggested\s+answer|answer\s+points?)[*_]*\s*[:：]\s*[*_]*\s*(.*)$/i);
    if (model) { fixed.push(model[2].trim() ? `**Model answer:** ${model[2].trim()}` : "**Model answer:**"); continue; }
    const exp = l.match(/^\s*[*_>\s]*(?:💡)?\s*[*_]*(explanation|rationale|reasoning|why)[*_]*\s*[:：]\s*[*_]*\s*(.*)$/i);
    if (exp) { fixed.push(`**Explanation:** ${exp[2].trim()}`.trimEnd()); continue; }
    fixed.push(l);
  }
  lines = fixed;

  // blank lines: one around headings and tables, never more than one in a row
  const spaced: string[] = [];
  const blank = () => { if (spaced.length && spaced[spaced.length - 1].trim() !== "") spaced.push(""); };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const isHead = /^#{1,6}\s/.test(l);
    const isQ = /^Question \d+:/.test(l);
    const startsTable = isTableLine(l) && !(spaced.length && isTableLine(spaced[spaced.length - 1]));
    const endsTable = !isTableLine(l) && l.trim() && spaced.length && isTableLine(spaced[spaced.length - 1]);
    if (isHead || isQ || startsTable || endsTable) blank();
    if (!l.trim()) { if (spaced.length && spaced[spaced.length - 1].trim() === "") continue; }
    spaced.push(l);
    if (isHead) { const n = lines[i + 1]; if (n !== undefined && n.trim()) spaced.push(""); }
  }
  text = spaced.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\s+$/, "") + "\n";
  return text;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// 3. Checker
// ---------------------------------------------------------------------------------------------------------------------------------------
interface Parsed { mcqs: { n: number; options: string[]; answer: string | null; explanation: boolean; stem: string }[]; essays: { q: string; model: boolean }[]; recall: number; practiceAt: number; headings: { level: number; text: string; at: number }[] }

function parse(content: string): Parsed {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const mcqs: Parsed["mcqs"] = [];
  const essays: Parsed["essays"] = [];
  const headings: Parsed["headings"] = [];
  let recall = 0;
  let practiceAt = -1;
  let cur: Parsed["mcqs"][number] | null = null;
  let mode: "notes" | "recall" | "mcq" | "saq" | "essay" = "notes";
  let pendingEssay: { q: string; model: boolean } | null = null;
  lines.forEach((l, i) => {
    const t = l.trim();
    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      headings.push({ level: h[1].length, text: h[2], at: i });
      const txt = h[2].toLowerCase();
      if (/practice\s+questions?|^practice$/.test(txt) && practiceAt < 0) practiceAt = i;
      if (/quick\s+recall|recall/.test(txt)) mode = "recall";
      else if (/\bmcq|multiple\s+choice/.test(txt)) mode = "mcq";
      else if (/short\s+answer|\bsaq/.test(txt)) mode = "saq";
      else if (/essay|long\s+answer|\blaq/.test(txt)) mode = "essay";
      else if (h[1].length <= 2 && !/practice/.test(txt)) mode = "notes";
      cur = null; pendingEssay = null;
      return;
    }
    const q = t.match(/^Question\s+(\d+)\s*:\s*(.*)$/);
    if (q) { cur = { n: Number(q[1]), options: [], answer: null, explanation: false, stem: q[2] }; mcqs.push(cur); return; }
    if (cur) {
      const o = t.match(/^([A-E])\.\s+\S/);
      if (o) { cur.options.push(o[1]); return; }
      const a = t.match(/^\*\*Answer:\*\*\s*([A-E])/);
      if (a) { cur.answer = a[1]; return; }
      if (/^\*\*Explanation:\*\*/.test(t)) { cur.explanation = true; return; }
    }
    if (mode === "recall" && /^\d+\.\s.+→.+/.test(t)) recall += 1;
    if ((mode === "saq" || mode === "essay") && /^\d+\.\s+\S/.test(t) && !/→/.test(t)) { pendingEssay = { q: t, model: false }; essays.push(pendingEssay); return; }
    if (pendingEssay && /^\*\*Model answer:\*\*/.test(t)) pendingEssay.model = true;
  });
  return { mcqs, essays, recall, practiceAt, headings };
}

const wordsOf = (s: string) => (s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/[#*_>|`-]/g, " ").match(/\b[\w'’-]+\b/g) ?? []).length;

/** `known` is the site's list of "Year N: Unit" categories; a category that is not on it is flagged with the closest match. */
export function lintNote(input: { title: string; category: string; content: string; hasImage?: boolean; known?: string[] }): NoteReport {
  const issues: NoteIssue[] = [];
  const add = (level: IssueLevel, code: string, message: string, fixable = false) => issues.push({ level, code, message, fixable });
  const content = input.content.replace(/\r\n?/g, "\n");
  const words = wordsOf(content);
  const p = parse(content);
  const lines = content.split("\n");

  if (words < 80) add("error", "short", "The note is almost empty. Paste the full text.");
  if (!/^Year\s*[1-6]\s*:\s*\S/.test(input.category)) add("error", "category", `The category must look like “Year 4: Internal Medicine” so the note appears under its unit. Now: “${input.category || "empty"}”.`);
  else if (input.known?.length && !input.known.some((k) => k.toLowerCase() === input.category.trim().toLowerCase())) {
    const want = new Set(tokens(input.category));
    const near = [...input.known].map((k) => ({ k, n: tokens(k).filter((w) => want.has(w)).length })).sort((a, b) => b.n - a.n)[0];
    add("error", "category-unknown", `“${input.category}” is not one of the site's units, so the note would not appear in any unit's notes.${near && near.n ? ` Did you mean “${near.k}”?` : ""}`);
  }
  if (input.title.trim().length < 8) add("error", "title", "The title is too short.");
  else if (input.title.length > 90) add("warn", "title-long", "The title is long (over 90 characters). Search results will cut it off.");
  if (/chatgpt|openai|as an ai/i.test(`${input.title} ${content.slice(0, 400)}`)) add("warn", "gpt-title", "The title or the start of the note mentions ChatGPT.", true);

  const edge = lines.filter((l) => l.trim()).slice(0, 3).concat(lines.filter((l) => l.trim()).slice(-4));
  if (edge.some((l) => CHAT_LEAD.test(l.trim().replace(/^[>*_\s]+/, "")) && l.length < 220 && !/^#/.test(l.trim()))) add("warn", "chat", "There is chat text at the start or end (“Here is…”, “Let me know…”).", true);
  if (lines.some(isRule)) add("warn", "rules", "There are horizontal lines (---). They break the page into pieces.", true);
  if (lines.some((l) => /^#\s+\S/.test(l))) add("warn", "h1", "A single “#” heading is used. The page title is already the title: use “##”.", true);
  if (lines.some((l) => /^#{1,6}\s+\*\*/.test(l) || /^#{1,6}\s+.*:\s*$/.test(l) || /^#{1,6}\s+\d+\.\s/.test(l))) add("warn", "heading-style", "Some headings carry bold, a colon or a number (“## **Causes:**”, “## 1. Intro”).", true);
  if (lines.some((l) => /^\s*[•◦▪●‣·]\s/.test(l) || /^\s*\*\s+(?!\*)/.test(l))) add("warn", "bullets", "Some bullets use a different symbol and will not show as a list.", true);

  const h2 = p.headings.filter((h) => h.level === 2 && !/practice|reference/i.test(h.text));
  if (!p.headings.some((h) => h.level >= 2)) add("error", "no-headings", "There are no headings. Add “##” headings for each topic.");
  else if (h2.length < 3 && words > 500) add("warn", "few-sections", "Few sections for a note this long. Split it with “##” headings.");
  if (!/key\s+points|summary|take-?away|at a glance|learning objectives?/i.test(p.headings.map((h) => h.text).join("|"))) add("tip", "key-points", "Add a “## Key points” section at the top. It is what students read first on a phone.");

  // walls of text and missing structure
  const blocks = content.split(/\n\s*\n/);
  const walls = blocks.filter((b) => !/^\s*(#|-|\||\d+\.|>|Question|[A-E]\.|\*\*)/.test(b) && b.length > 650).length;
  if (walls) add("warn", "walls", `${walls} paragraph${walls === 1 ? " is" : "s are"} very long (over 650 characters). Break ${walls === 1 ? "it" : "them"} into bullets or a table.`);
  const bulletLines = lines.filter((l) => /^\s*-\s+\S/.test(l)).length;
  const tableLines = lines.filter(isTableLine).length;
  if (words > 400 && bulletLines + tableLines < 6) add("warn", "all-prose", "The note is almost all paragraphs. Use bullet points and tables so it is easy to scan.");
  const hasTableHead = lines.some((l, i) => isTableLine(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? ""));
  if (tableLines && !hasTableHead) add("warn", "table", "A table has no header separator row (| --- | --- |), so it will not display as a table.");

  // images
  const imgs = [...content.matchAll(/!\[([^\]]*)\]\(([^)]*)\)/g)];
  if (imgs.some((m) => !m[1].trim())) add("tip", "alt", "Some images have no caption. Put a short description in the brackets: ![caption](url).");
  if (imgs.some((m) => !/^https?:\/\//.test(m[2].trim()))) add("warn", "img-url", "An image link is not a full web address, so it will not load.");

  // questions
  if (p.practiceAt < 0 && p.mcqs.length === 0) add("tip", "no-practice", "There are no practice questions. Add a “## Practice Questions” section at the end (MCQs, short answers, essay).");
  else if (p.practiceAt >= 0) {
    const after = p.headings.filter((h) => h.at > p.practiceAt && h.level === 2 && !/practice|reference|mcq|essay|short/i.test(h.text));
    if (after.length) add("warn", "order", `Notes content comes after the practice questions (“${after[0].text}”). Questions belong at the very end.`);
  }
  const noAnswer = p.mcqs.filter((m) => !m.answer);
  const fewOpts = p.mcqs.filter((m) => m.options.length < 4);
  const badKey = p.mcqs.filter((m) => m.answer && !m.options.includes(m.answer));
  const noExp = p.mcqs.filter((m) => m.answer && !m.explanation);
  if (noAnswer.length) add("error", "mcq-answer", `${noAnswer.length} MCQ${noAnswer.length === 1 ? " has" : "s have"} no “**Answer:** X” line (Question ${noAnswer.slice(0, 4).map((m) => m.n).join(", ")}${noAnswer.length > 4 ? "…" : ""}).`);
  if (fewOpts.length) add("error", "mcq-options", `${fewOpts.length} MCQ${fewOpts.length === 1 ? " has" : "s have"} fewer than 4 options, or the options are not written as “A.” “B.” on their own lines (Question ${fewOpts.slice(0, 4).map((m) => m.n).join(", ")}).`);
  if (badKey.length) add("error", "mcq-key", `The answer letter is not one of the options in Question ${badKey.slice(0, 4).map((m) => m.n).join(", ")}.`);
  if (noExp.length) add("warn", "mcq-explanation", `${noExp.length} MCQ${noExp.length === 1 ? " has" : "s have"} no explanation, so students will not learn from a wrong answer.`);
  if (p.mcqs.length >= 6) {
    const counts = new Map<string, number>();
    p.mcqs.forEach((m) => m.answer && counts.set(m.answer, (counts.get(m.answer) ?? 0) + 1));
    const top = Math.max(0, ...counts.values());
    if (top / p.mcqs.length > 0.5) add("warn", "mcq-skew", "More than half of the answers are the same letter. Students will notice. Shuffle the options.");
  }
  if (p.mcqs.length && !lines.some((l) => /^Question\s+\d+\s*:/.test(l.trim()))) add("warn", "mcq-format", "Questions are not written as “Question 1: …”.", true);
  const noModel = p.essays.filter((e) => !e.model);
  if (noModel.length) add("warn", "essay-model", `${noModel.length} short-answer or essay question${noModel.length === 1 ? " has" : "s have"} no “**Model answer:**”, so there is nothing to reveal.`);
  if (p.practiceAt >= 0 && p.mcqs.length < 5) add("tip", "mcq-count", `Only ${p.mcqs.length} MCQs. Ten is a good number for a note.`);
  if (p.essays.length === 0 && p.practiceAt >= 0) add("tip", "no-essay", "No short-answer or essay questions. Add one or two with model answers.");

  if (!input.hasImage) add("tip", "image", "No picture in the note. A share card is drawn from the title, year and unit, so the link still looks good. A real diagram makes it better.");

  const order: Record<IssueLevel, number> = { error: 0, warn: 1, tip: 2 };
  issues.sort((a, b) => order[a.level] - order[b.level]);
  return { issues, mcqs: p.mcqs.length, essays: p.essays.length, recall: p.recall, words, readMinutes: Math.max(1, Math.round(words / 200)), sections: h2.length };
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// 4. Course outline match
// ---------------------------------------------------------------------------------------------------------------------------------------
const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["the", "and", "of", "in", "for", "to", "a", "an", "on", "with", "notes", "note", "management", "overview", "introduction", "clinical", "features", "diagnosis", "treatment"]);
const tokens = (s: string) => norm(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w));

export interface OutlineMatch {
  outline: CourseOutline | null;
  item: OutlineItem | null;
  section: string | null;
  /** 0..1 */
  score: number;
  /** "Wk 3", "Wk 1–11" ... when the topic is in the outline */
  week: string | null;
  note: string;
}

export function matchOutline(category: string, title: string): OutlineMatch {
  const m = category.match(/^Year\s*([1-6])\s*:\s*(.+)$/i);
  if (!m) return { outline: null, item: null, section: null, score: 0, week: null, note: "No year in the category, so the course outline cannot be checked." };
  const year = Number(m[1]);
  const unit = norm(m[2]);
  const outlines = COURSE_OUTLINES.filter((o) => o.year === year);
  // an exact unit name, or a longer name that contains it as whole words; never one shared word ("pathology" is not "oral pathology")
  const contains = (a: string, b: string) => ` ${a} `.includes(` ${b} `) && b.split(" ").length >= 2;
  const alias: Record<string, string> = { medicine: "internal medicine", obgyn: "obstetrics and gynaecology", obstetrics: "obstetrics and gynaecology", pediatrics: "paediatrics", pharmacology: "clinical pharmacology" };
  const want0 = alias[unit] ?? unit;
  const outline = outlines.find((o) => [o.id, o.department, o.title, ...(o.librarySlugs ?? [])].some((c) => { const n = norm(c); return n && (n === want0 || contains(want0, n) || contains(n, want0)); })) ?? null;
  if (!outline) return { outline: null, item: null, section: null, score: 0, week: null, note: `There is no course outline for “${m[2]}” in Year ${year} on the site yet, so the topic and week cannot be checked.` };
  const want = tokens(title);
  let best: { item: OutlineItem; section: string; score: number } | null = null;
  for (const sec of outline.sections) for (const item of sec.items) {
    const have = new Set(tokens(`${item.title} ${item.detail ?? ""}`));
    if (!have.size || !want.length) continue;
    const hit = want.filter((w) => have.has(w) || [...have].some((h) => h.length > 4 && (h.startsWith(w) || w.startsWith(h)))).length;
    const score = hit / Math.min(want.length, Math.max(have.size, 2));
    if (!best || score > best.score) best = { item, section: sec.title, score };
  }
  if (!best || best.score < 0.34) return { outline, item: null, section: null, score: best?.score ?? 0, week: null, note: `Unit found (${outline.title}), but no topic in its outline matches this title. Check that the title uses the outline's wording.` };
  return { outline, item: best.item, section: best.section, score: Math.min(1, best.score), week: best.item.week ?? null, note: `Matches “${best.item.title}” in ${best.section}${best.item.week ? ` (${best.item.week})` : ""}.` };
}
