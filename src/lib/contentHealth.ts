// Checks a blog post for the faults that make a page look unfinished: too little text, scan noise, chat leftovers, a bad title, and (for
// question banks) answers that repeat a letter, are missing, or always give themselves away. Used by the admin "Content health" page.
import { balanceArticleLetters } from "../../supabase/functions/_shared/markdownMcqs.js";

export interface Issue { code: string; label: string; weight: number }
export interface HealthInput { id: string; title: string; category: string; content: string }
export interface HealthReport { issues: Issue[]; score: number; questions: number; dist: Record<string, number>; textLength: number }

const plain = (c: string) => c.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/<[^>]+>/g, " ").replace(/[*_#>`|]/g, " ").replace(/\s+/g, " ").trim();
export const titleKey = (t: string) => t.toLowerCase().replace(/past paper|questions? (&|and) answers?|revised|\d{4}/g, " ").replace(/[^a-z]+/g, " ").trim();

/** The questions of a post in the site's own format: "Question N", options "A. …", then "Answer: X. …". */
export function parseQuestions(content: string) {
  const parts = content.replace(/\r/g, "").split(/\n(?=(?:#{1,4}\s*)?\**Question\s+\d+\b)/).filter((p) => /^(?:#{1,4}\s*)?\**Question\s+\d+/.test(p));
  return parts.map((p) => {
    const lines = p.split("\n");
    const opts = lines.filter((l) => /^[A-E]\. \S/.test(l)).map((l) => l.slice(3).trim());
    const ans = lines.find((l) => /^Answer:\s*[A-E]\b/.test(l));
    const letter = ans?.match(/^Answer:\s*([A-E])/)?.[1] ?? "";
    const hasExpl = /^Explanation:\s*\S/m.test(p);
    const stem = lines[0].replace(/^(?:#{1,4}\s*)?\**Question\s+\d+\**[:.)\s-]*/, "").trim() || (lines[1] ?? "").trim();
    return { stem, opts, letter, hasExpl };
  });
}

export function analyse(p: HealthInput): HealthReport {
  const issues: Issue[] = [];
  const add = (code: string, label: string, weight: number) => issues.push({ code, label, weight });
  const content = p.content ?? "";
  const text = plain(content);
  const images = (content.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length;
  if (images >= 3 && text.length < 500) add("image-only", `Only pictures (${images} pages), no typed text`, 5);
  else if (text.length < 500 && images < 3) add("thin", `Very little text (${text.length} characters)`, 4);
  if (/(^|\n)\s*(got it|sure|certainly|of course)[.,!]?\s+(here|i)|as an ai\b|here are the (notes|questions)/i.test(content)) add("chat", "Leftover AI chat lines", 3);
  if (/\\\(|\\\[|\$\$/.test(content)) add("latex", "Maths markup showing as code", 2);
  if (/Source page \d+|^Explanation:\s*\*\*\s*$/im.test(content)) add("residue", "Scan or import residue (page markers)", 2);
  const odd = (text.match(/[^A-Za-z0-9\s.,;:!?'"()\-–—/%&=<>+À-ɏ]/g) ?? []).length;
  if (text.length > 600 && odd / text.length > 0.06) add("ocr", "Looks like scan noise (odd characters)", 3);
  if (/\.(pdf|docx?|pptx?)$/i.test(p.title) || /^(img|image|scan|document)[ _-]?\d+/i.test(p.title) || p.title.trim().length < 8 || /untitled/i.test(p.title)) add("title", "Title looks like a file name", 2);
  if (!/^Year \d/i.test(p.category || "")) add("category", "Not filed under a year", 1);

  const qs = parseQuestions(content);
  const dist: Record<string, number> = {};
  if (qs.length >= 10) {
    for (const q of qs) if (q.letter) dist[q.letter] = (dist[q.letter] ?? 0) + 1;
    const answered = qs.filter((q) => q.letter).length;
    const top = Math.max(0, ...Object.values(dist));
    if (answered >= 10 && top / answered >= 0.55) add("letters", `Answer letters unbalanced (${Math.round((top / answered) * 100)}% the same)`, 3);
    let run = 1, best = 1; for (let i = 1; i < qs.length; i++) { run = qs[i].letter && qs[i].letter === qs[i - 1].letter ? run + 1 : 1; best = Math.max(best, run); }
    if (best >= 4) add("runs", `The same answer letter ${best} times in a row`, 2);
    const noAns = qs.filter((q) => !q.letter).length;
    if (noAns / qs.length > 0.1) add("no-answer", `${noAns} of ${qs.length} questions have no answer`, 4);
    const noExpl = qs.filter((q) => !q.hasExpl).length;
    if (noExpl / qs.length > 0.5) add("no-expl", `${Math.round((noExpl / qs.length) * 100)}% of answers have no explanation`, 1);
    const longest = qs.filter((q) => { const i = "ABCDE".indexOf(q.letter); return i >= 0 && q.opts[i] && q.opts.every((o, k) => k === i || o.length < q.opts[i].length); }).length;
    if (answered >= 10 && longest / answered > 0.6) add("longest", "The right answer is usually the longest option", 2);
    const seen = new Set<string>(); let dup = 0; for (const q of qs) { const k = q.stem.toLowerCase().replace(/\W+/g, " ").slice(0, 80); if (k.length > 20 && seen.has(k)) dup++; seen.add(k); }
    if (dup >= 3) add("dup-q", `${dup} repeated questions`, 2);
  }
  return { issues, score: issues.reduce((a, i) => a + i.weight, 0), questions: qs.length, dist, textLength: text.length };
}

// ---- answer letters: even out where the right answers sit (supabase/functions/_shared/markdownMcqs.js) ----------------------------------------

/** The same post with its answer letters evened out across the post (options are moved, the right answer never changes; questions whose options
 *  refer to each other or whose explanation names a letter are left alone). */
export function balanceLetters(id: string, content: string): { content: string; changed: number; skipped: number } {
  const res = balanceArticleLetters(id, content, { force: true });
  return { content: res.content, changed: res.changed, skipped: res.skipped };
}
