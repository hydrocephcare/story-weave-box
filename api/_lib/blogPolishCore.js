// Pure helpers for the blog polish: what kind of page is it, what may be changed, and is the polished text still true to the original.
// No network here, so it can be tested.

export const plain = (c) => String(c ?? "").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
export const picturesIn = (c) => (String(c ?? "").match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length;
export const yearOf = (category) => Number(String(category ?? "").match(/^Year\s*(\d)/i)?.[1] ?? 0);

/** A question bank or paper, judged by what is inside it and not by its title. */
export function isBank(content) {
  const c = String(content ?? "");
  const qs = (c.match(/^(?:#{1,4}\s*)?\**(?:Question|Q)\s*\d+/gim) ?? []).length;
  const answers = (c.match(/^\**Answers?\**\s*[:.]/gim) ?? []).length;
  const options = (c.match(/^\s*[-*]?\s*\(?[A-E][.)]\s+\S/gm) ?? []).length;
  return qs >= 5 || answers >= 8 || options >= 24;
}

/** The stored text is only reading noise or a stub: the scanned pages are the paper, so the text must not be polished. */
export function isScanOnly(content) {
  const p = plain(content);
  const stub = p.length < 260 && /original (paper )?scans|awaiting manual transcription|transcription is being generated/i.test(p);
  return stub || /Visual Scan Archive/i.test(content) || (String(content).match(/Scanned by Cam\s?Scanner/gi) ?? []).length >= 3;
}

/** A bank whose questions are not yet in the form the site understands (Question N, options A. B. C., "Answer: X", "Explanation:"). */
export function needsMcqFormat(content) {
  const c = String(content ?? "");
  const qs = (c.match(/^(?:#{1,4}\s*)?\**Question\s*\d+/gim) ?? []).length;
  if (qs < 5) return false;
  const options = (c.match(/^\s*[-*]?\s*\(?[A-E][.)]\s+\S/gm) ?? []).length;
  if (options < qs * 2) return false; // essay or short-answer paper: nothing to put in option form
  const answers = (c.match(/^\**Answer\**\s*:\s*\**\s*\(?[A-E]\b/gim) ?? []).length;
  return answers < qs * 0.8;
}

/** The polished text must still say what the original said: numbers and long words kept, pictures kept, a sensible length, real headings. */
export function soundPolish(original, out, { headings = true, maxRatio = 1.4, minWords = 0.8, minRatio = 0.8, minNums = 0.9 } = {}) {
  const nums = [...new Set((plain(original).match(/\d+(?:[.,]\d+)?/g) ?? []).filter((n) => n.length >= 2))];
  const keptNums = nums.filter((n) => out.includes(n)).length;
  if (nums.length >= 5 && keptNums / nums.length < minNums) return `numbers lost (${keptNums}/${nums.length})`;
  const words = [...new Set(plain(original).toLowerCase().match(/[a-z]{7,}/g) ?? [])];
  const o = out.toLowerCase();
  const kept = words.filter((w) => o.includes(w)).length;
  if (words.length >= 20 && kept / words.length < minWords) return `words lost (${kept}/${words.length})`;
  const ratio = plain(out).length / Math.max(1, plain(original).length);
  if (ratio < minRatio || ratio > maxRatio) return `length changed (${ratio.toFixed(2)})`;
  if (headings && (out.match(/^##\s/gm) ?? []).length < 2) return "no headings";
  const pics = picturesIn(original);
  if (pics && picturesIn(out) < pics) return "pictures lost";
  return "";
}

/** A short, clean title and a description for search results (about 155 characters), both safe to show. */
export function cleanMeta(title, description) {
  const t = String(title ?? "").replace(/\s+/g, " ").trim().replace(/^["'“”]+|["'“”]+$/g, "").trim().slice(0, 90);
  let d = String(description ?? "").replace(/\s+/g, " ").trim().replace(/^["'“”]+|["'“”]+$/g, "").trim();
  if (d.length > 160) {
    // end at a full sentence when there is one, otherwise at a whole word: no trailing "…"
    const head = d.slice(0, 158);
    const stop = Math.max(head.lastIndexOf(". "), head.lastIndexOf("; "));
    d = stop >= 80 ? head.slice(0, stop + 1) : head.replace(/\s+\S*$/, "").replace(/[,;:\s]+$/, "") + ".";
  }
  return { title: t.length >= 8 ? t : "", description: d.length >= 40 ? d : "" };
}

export function parseJson(text) {
  const m = String(text ?? "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export const VERDICTS = ["keep", "review", "irrelevant"];

/** Written questions (essay, short answer, spot) not yet in the site's layout: "**1. question**" then "**Model answer:** ...". */
export function needsPaperFormat(content) {
  const c = String(content ?? "");
  const qs = (c.match(/^(?:#{1,4}\s*)?\**(?:Question|Q)\s*\d+/gim) ?? []).length;
  if (qs < 3) return false;
  const options = (c.match(/^\s*[-*]?\s*\(?[A-E][.)]\s+\S/gm) ?? []).length;
  if (options >= qs * 2) return false; // a multiple-choice bank
  const standard = (c.match(/^\*\*\d+\.\s+.+\*\*\s*$/gm) ?? []).length;
  return standard < qs * 0.8;
}

/** What kind of page this is, which decides how it is polished: scan | questions | formatted | note.
 *  "questions" is any page of MCQs, essays, short answers or spot questions that is not yet in the site's layout. */
export function kindOf(content) {
  if (isScanOnly(content)) return "scan";
  const c = String(content ?? "");
  const qs = (c.match(/^(?:#{1,4}\s*)?\**(?:Question|Q)\s*\d+/gim) ?? []).length;
  const sections = (c.match(/^##\s/gm) ?? []).length;
  // an exam typed from a scan whose typing is broken is not rewritten by the AI (it loses real content); the page shows the scanned pages instead
  if (isExamLike(c) && ocrDamaged(c)) return "scan";
  const questionPage = isBank(c) || (qs >= 3 && sections < 3) || isExamLike(c);
  if (questionPage) {
    if (needsMcqFormat(c) || needsPaperFormat(c)) return "questions";
    // an exam typed from a scan whose questions are not numbered "Question N": it still needs the site's layout
    const standard = (c.match(/^\*\*\d+\.\s+.+\*\*\s*$/gm) ?? []).length + (c.match(/^###\s+Question\s*\d+/gim) ?? []).length;
    if (isExamLike(c) && standard < 3) return "questions";
    return "formatted";
  }
  return "note";
}

/** Splits long text into pieces of about `max` characters, only at a heading or a question, or (if there is none) at a blank line. */
export function chunksOf(text, max = 8500) {
  const out = [];
  let cur = [];
  let len = 0;
  const starts = (l) => /^#{1,3}\s|^(?:#{1,4}\s*)?\**Question\s*\d+/i.test(l);
  for (const line of String(text ?? "").split("\n")) {
    const boundary = starts(line) && len > max * 0.55;
    const forced = line.trim() === "" && len > max * 1.25;
    if ((boundary || forced) && cur.length) { out.push(cur.join("\n")); cur = []; len = 0; }
    cur.push(line); len += line.length + 1;
  }
  if (cur.length) out.push(cur.join("\n"));
  return out.filter((c) => c.trim());
}

/** The AI sometimes drops a picture line. Put each missing one back, near where it was (the same share of the way through the text). */
export function restorePictures(original, out) {
  const pics = String(original ?? "").match(/^!\[[^\]]*\]\([^)]*\)\s*$/gm) ?? [];
  const missing = pics.filter((p) => !out.includes(p.trim()));
  if (!missing.length) return out;
  let text = out;
  const total = original.length || 1;
  for (const p of missing) {
    const frac = original.indexOf(p) / total;
    // a picture goes after a paragraph, never straight under a heading
    const breaks = [...text.matchAll(/\n\s*\n/g)].filter((m) => !/^#{1,6}\s/.test(text.slice(0, m.index).split("\n").pop() ?? "")).map((m) => m.index + m[0].length);
    const target = Math.round(frac * text.length);
    const at = breaks.length ? breaks.reduce((best, b) => (Math.abs(b - target) < Math.abs(best - target) ? b : best), breaks[0]) : text.length;
    text = `${text.slice(0, at)}${p.trim()}\n\n${text.slice(at)}`;
  }
  return text;
}

/** The long words and numbers of the original that the polished text left out (for asking the AI to put them back). */
export function missingFrom(original, out) {
  const o = out.toLowerCase();
  const words = [...new Set(plain(original).toLowerCase().match(/[a-z]{7,}/g) ?? [])].filter((w) => !o.includes(w));
  const nums = [...new Set((plain(original).match(/\d+(?:[.,]\d+)?/g) ?? []).filter((n) => n.length >= 2))].filter((n) => !out.includes(n));
  return [...nums, ...words];
}

/** Sentences or lines of the original that the polished text does not carry: most of their longer words are absent, or a number they hold is. */
export function missingSentences(original, out, limit = 40) {
  const o = out.toLowerCase();
  const lines = String(original ?? "").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").split(/\n+|(?<=[.!?])\s+/).map((l) => l.trim()).filter((l) => l.length > 12);
  const missing = [];
  for (const l of lines) {
    const ws = [...new Set(l.toLowerCase().match(/[a-z]{6,}/g) ?? [])];
    const nums = (l.match(/\d{2,}/g) ?? []).filter((n) => !out.includes(n));
    const wordsGone = ws.length >= 2 && ws.filter((w) => o.includes(w)).length / ws.length < 0.6;
    if (wordsGone || nums.length) missing.push(l.slice(0, 300));
    if (missing.length >= limit) break;
  }
  return missing;
}

/** Pages with the site's pay-gate markers must never be rewritten. */
export const hasLocked = (content) => /\[locked\b/i.test(String(content ?? ""));

/** An exam paper typed from a scan: marks, sections and instructions, even when its questions are not numbered "Question N". */
export function isExamLike(content) {
  const c = String(content ?? "");
  const marks = (c.match(/\(\s*\d+\s*marks?\s*\)|\d+\s*marks?\b/gi) ?? []).length;
  return marks >= 4 && /section\s+[a-d]\b|attempt\s+(any|all)|answer\s+(any|all)|time\s*[:\-]|date\s*[:\-]/i.test(c);
}

/** The page-picture lines stored with a scanned paper (original_notes). */
export function scanPages(originalNotes) {
  return String(originalNotes ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => /^!\[[^\]]*\]\([^\s)]+\)$/.test(l));
}

/** A paper typed from scans keeps the scans under it, so diagrams and anything the typing lost are still there. */
export function withScans(content, originalNotes) {
  const pages = scanPages(originalNotes).filter((p) => !content.includes(p));
  if (pages.length < 2) return content;
  return `${content.trim()}\n\n## Original pages\n\nThe pages as they were printed, for the diagrams and anything the typing above could not keep.\n\n${pages.join("\n\n")}\n`;
}

/** The typing of a scanned paper is broken: page markers inside the text, or diagrams shredded into runs of one-to-four-character lines. */
export function ocrDamaged(content) {
  const c = String(content ?? "");
  if (/^.{0,12}Page\s+\d+\s+of\s+\d+/im.test(c)) return true;
  let run = 0, runs = 0;
  for (const line of c.split("\n")) {
    const t = line.trim();
    if (t && t.length <= 9 && !/[A-Za-z]{4,}/.test(t) && !/^(\d+[.)]?|[A-E][.)]?|[-*|>#]+|\(?[ivx]+\)?)$/i.test(t) && (t.length <= 4 || /[—–=|]/.test(t))) { run++; if (run === 3) runs++; } else if (t) run = 0;
  }
  return runs >= 1;
}
