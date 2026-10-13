// Checks a blog post for the faults that make a page look unfinished: too little text, scan noise, chat leftovers, a bad title, and (for
// question banks) answers that repeat a letter, are missing, or always give themselves away. Used by the admin "Content health" page.

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

// ---- answer letters: put the right answer in a different place in each question --------------------------------------------------------

const REF = /\b(all|none|both|neither|any)\b[^.]{0,25}\b(above|these|of the|options?|answers?|choices?)\b|\b[A-E]\s*(and|&|,|or)\s*[A-E]\b|\b[A-E]\s*only\b/i;
function rng(seed: number) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
const hash = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

function shuffleBlock(lines: string[], rand: () => number): string[] | null {
  const idx: number[] = []; lines.forEach((l, i) => { if (/^[A-E]\. \S/.test(l)) idx.push(i); });
  if (idx.length < 4) return null;
  const ans = lines.findIndex((l) => /^Answer: [A-E]\b/.test(l));
  if (ans < 0 || ans < idx[idx.length - 1]) return null;
  const opts = idx.map((i) => lines[i].slice(3));
  const letters = "ABCDE".slice(0, opts.length);
  if (idx.some((i, k) => lines[i][0] !== letters[k])) return null;
  if (opts.some((o) => REF.test(o) || /^Option [A-E]/i.test(o) || o.length > 220)) return null;
  const expl = lines.slice(ans + 1).join(" ");
  if (/\b(option|choice)s?\s+[A-E]\b|\b[A-E]\)\s/i.test(expl) || /\b[A-E]\b is (the |incorrect|correct)/.test(expl)) return null;
  const ci = letters.indexOf(lines[ans].match(/^Answer: ([A-E])/)![1]);
  if (ci < 0) return null;
  const order = opts.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const out = lines.slice();
  idx.forEach((li, k) => { out[li] = `${letters[k]}. ${opts[order[k]]}`; });
  out[ans] = `Answer: ${letters[order.indexOf(ci)]}. ${opts[ci]}`;
  return out;
}

/** The same post with the options of each question shuffled (and the answer line following the right option). Questions whose options refer to each other are left alone. */
export function balanceLetters(id: string, content: string): { content: string; changed: number; skipped: number } {
  const rand = rng(hash(id));
  let changed = 0, skipped = 0;
  const parts = content.replace(/\r/g, "").split(/\n(?=(?:#{1,4}\s*)?\**Question\s+\d+\b)/);
  const out = parts.map((p) => {
    if (!/^(?:#{1,4}\s*)?\**Question\s+\d+/.test(p)) return p;
    const res = shuffleBlock(p.split("\n"), rand);
    if (!res) { skipped++; return p; }
    changed++;
    return res.join("\n");
  });
  return { content: out.join("\n"), changed, skipped };
}
