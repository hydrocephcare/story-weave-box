// A small markdown renderer for notes that ship with the site. It is plain JavaScript so the build-time
// prerender (Node) and the app (browser) produce the same HTML. It handles what the notes use:
// headings, paragraphs, bold/italic/code, bullet and numbered lists (nested), checkbox lists, tables and rules.
// Everything is escaped first, so a note can never inject markup.
//
// With { questions: true } it also lays out practice questions the way a student wants them:
//   - an MCQ ("**1. Stem?**", then A. B. C. D. options, then "**Answer: C.** why") becomes a card with tappable options and the
//     answer and reasoning behind a "Show answer" button;
//   - a short question followed by its answer ("**3. Name the four domains.**" and a paragraph) becomes a tap-to-open answer;
//   - "Key points" and "Learning objectives" sections become a highlighted card, and "**Core rule:**"-style lines become call-outs.
// Past papers do not use this: they have their own layout (PaperBody).

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const slugify = (s) => String(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function inline(text) {
  let t = esc(text);
  // [text](/path) is an in-site link (class note-link, so the note page can remember where you were);
  // [text](https://...) opens in a new tab. Only those two forms are allowed.
  t = t.replace(/\[([^\]]+)\]\((\/[^)\s]*|https?:\/\/[^)\s]+)\)/g, (_, label, href) => (href.startsWith("/")
    ? `<a class="note-link" href="${href}">${label}</a>`
    : `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`));
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, "$1<em>$2</em>");
  return t;
}

const LIST = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

function parseList(lines, start, indent) {
  const ordered = /\d+\./.test(lines[start].match(LIST)[2]);
  let html = "";
  let i = start;
  while (i < lines.length) {
    const m = lines[i].match(LIST);
    if (!m || m[1].length !== indent) break;
    let text = m[3];
    let box = "";
    const cb = text.match(/^\[( |x)\]\s+(.*)$/i);
    if (cb) { box = `<input type="checkbox" disabled ${cb[1].toLowerCase() === "x" ? "checked " : ""}/> `; text = cb[2]; }
    i++;
    let nested = "";
    const next = lines[i]?.match(LIST);
    if (next && next[1].length > indent) {
      const [sub, after] = parseList(lines, i, next[1].length);
      nested = sub; i = after;
    }
    html += `<li>${box}${inline(text)}${nested}</li>`;
  }
  const tag = ordered ? "ol" : "ul";
  return [`<${tag}>${html}</${tag}>`, i];
}

function table(rows) {
  const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  return `<div class="note-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

// ---------- practice questions ----------
const Q_BOLD = /^\*\*\s*(?:Question\s*|Q)?(\d{1,3})\s*[.):]\s*(.+?)\s*\*\*\s*$/i;
const Q_PLAIN = /^(?:Question\s*|Q)(\d{1,3})\s*[.):]\s*(.+?)\s*$/i;
const Q_NUM = /^(\d{1,3})[.)]\s+(.+?)\s*$/;
const OPT = /^\s*\(?([A-Ea-e])[.)]\s+(.*?)\s*$/;
const ANS = /^\*{0,2}\s*(?:correct\s+)?answer\s*:?\s*\*{0,2}\s*:?\s*\(?([A-Ea-e])\)?\s*[.)]?\s*\*{0,2}\s*(.*)$/i;
const EXPL = /^\*{0,2}\s*(?:explanation|rationale|reasoning)\s*:?\s*\*{0,2}\s*:?\s*(.*)$/i;
const MODEL = /^\*{0,2}\s*(?:model\s+answer|suggested\s+answer|answer)\s*:?\s*\*{0,2}\s*:?\s*(.*)$/i;
const isBlock = (l) => /^(#{1,4}\s|-{3,}\s*$|\s*\||>)/.test(l);

function questionStart(line) {
  const t = line.trim();
  const m = t.match(Q_BOLD) || t.match(Q_PLAIN) || t.match(Q_NUM);
  return m ? { n: m[1], stem: m[2].replace(/\*\*/g, "").trim() } : null;
}
const nextNonBlank = (lines, i) => { let j = i; while (j < lines.length && !lines[j].trim()) j++; return j; };

/** "Question, options, answer" starting at line i, or null. Returns [html, nextIndex]. */
function mcqBlock(lines, i) {
  const q = questionStart(lines[i]);
  if (!q) return null;
  let j = i + 1;
  const stem = [q.stem];
  // a stem that runs on to a second line
  while (j < lines.length && lines[j].trim() && !OPT.test(lines[j]) && !isBlock(lines[j]) && !questionStart(lines[j]) && stem.length < 3) stem.push(lines[j++].trim());
  j = nextNonBlank(lines, j);
  const opts = [];
  while (j < lines.length && OPT.test(lines[j])) { const m = lines[j].match(OPT); opts.push([m[1].toUpperCase(), m[2]]); j++; }
  if (opts.length < 2) return null;
  let k = nextNonBlank(lines, j);
  let letter = null;
  const why = [];
  const a = k < lines.length ? lines[k].trim().match(ANS) : null;
  if (a) {
    letter = a[1].toUpperCase();
    if (a[2]) why.push(a[2].replace(/^\*+\s*/, "").replace(/^(?:explanation|rationale)\s*:?\s*/i, ""));
    k++;
    // explanation lines directly after the answer
    while (k < lines.length && lines[k].trim() && !questionStart(lines[k]) && !isBlock(lines[k]) && !OPT.test(lines[k])) {
      const e = lines[k].trim().match(EXPL);
      why.push(e ? e[1] : lines[k].trim());
      k++;
    }
    j = k;
  }
  const letters = opts.map((o) => o[0]);
  const reveal = letter && letters.includes(letter);
  const optHtml = opts.map(([l, t]) => `<li class="qa-opt" data-l="${l}" role="button" tabindex="0"><span class="qa-l">${l}</span><span>${inline(t.replace(/\*\*/g, ""))}</span></li>`).join("");
  const right = reveal ? opts.find((o) => o[0] === letter)[1].replace(/\*\*/g, "") : "";
  const explain = why.join(" ").replace(/\s+/g, " ").trim();
  const ansHtml = reveal
    ? `<details class="qa-ans"><summary>Show answer</summary><div class="qa-a"><p><strong>Answer: ${letter}.</strong> ${inline(right)}</p>${explain ? `<p class="qa-why">${inline(explain)}</p>` : ""}</div></details>`
    : "";
  return [`<div class="qa qa-mcq"${reveal ? ` data-correct="${letter}"` : ""}><p class="qa-q"><span class="qa-n">${esc(q.n)}</span><span>${inline(stem.join(" "))}</span></p><ul class="qa-opts">${optHtml}</ul>${ansHtml}</div>`, j];
}

/** "Short question" followed by its answer paragraph(s): the answer opens on tap. */
function recallBlock(lines, i) {
  const t = lines[i].trim();
  const m = t.match(Q_BOLD);
  if (!m) return null;
  let j = i + 1;
  const body = [];
  while (j < lines.length && lines[j].trim() && !questionStart(lines[j]) && !isBlock(lines[j]) && !/^\*\*\s*(?:Question\s*|Q)?\d/.test(lines[j].trim())) body.push(lines[j++]);
  // bullets that follow after a blank line belong to the same answer
  if (body.length && j < lines.length) {
    let k = nextNonBlank(lines, j);
    if (k > j && k < lines.length && LIST.test(lines[k]) && !questionStart(lines[k])) { while (k < lines.length && (LIST.test(lines[k]) || /^\s+\S/.test(lines[k]))) body.push(lines[k++]); j = k; }
  }
  if (!body.length) return null;
  const first = body[0].trim().match(MODEL);
  if (first) body[0] = first[1] || "";
  const inner = mdToHtml(body.filter((l, idx) => idx > 0 || l.trim()).join("\n")).html;
  return [`<details class="qa qa-recall"><summary><span class="qa-n">${esc(m[1])}</span><span class="qa-q">${inline(m[2].replace(/\*\*/g, ""))}</span><span class="qa-show">Show answer</span></summary><div class="qa-a">${inner}</div></details>`, j];
}

const CALLOUT = /^\*\*(core rule|remember|key point|key points|exam tip|high yield|high-yield|red flag|red flags|safety|important|mnemonic|clinical pearl|pearl|tip|warning|note)\b[^*]*\*\*/i;
const CARD_HEADING = /^(key points?|learning objectives?|objectives?|at a glance|high[- ]yield( points)?|summary)$/i;

/** Markdown to HTML. Returns { html, headings } where headings lists the ## sections for a table of contents. */
export function mdToHtml(source, { skipTitle = false, questions = false } = {}) {
  const lines = String(source).replace(/\r\n/g, "\n").split("\n");
  if (skipTitle) { const first = lines.findIndex((l) => l.trim()); if (first >= 0 && /^#\s/.test(lines[first])) lines.splice(first, 1); }
  const out = [];
  const headings = [];
  let card = false;
  let inQuestions = false; // under a heading about questions: only there is "bold line + paragraph" read as a question and its answer
  const closeCard = () => { if (card) { out.push("</div>"); card = false; } };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const id = slugify(h[2].replace(/\*+/g, ""));
      closeCard();
      if (level <= 2) inQuestions = /question|practice|recall|quiz|mcq|viva|osce|test yourself|self[- ]check/i.test(h[2]);
      if (level === 2) headings.push({ id, text: h[2].replace(/\*+/g, "") });
      out.push(`<h${level} id="${id}">${inline(h[2])}</h${level}>`);
      if (questions && level <= 3 && CARD_HEADING.test(h[2].replace(/\*+/g, "").replace(/^\d+\.\s*/, "").trim())) { out.push('<div class="note-card">'); card = true; }
      i++; continue;
    }
    if (/^-{3,}\s*$/.test(line)) { out.push("<hr />"); i++; continue; }
    if (/^>\s?/.test(line)) {
      const quoted = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quoted.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote><p>${inline(quoted.join(" "))}</p></blockquote>`); continue;
    }
    if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      out.push(table(rows)); continue;
    }
    if (questions) {
      const mcq = mcqBlock(lines, i);
      if (mcq) { closeCard(); out.push(mcq[0]); i = mcq[1]; continue; }
      const recall = inQuestions ? recallBlock(lines, i) : null;
      if (recall) { closeCard(); out.push(recall[0]); i = recall[1]; continue; }
    }
    if (LIST.test(line)) {
      const [html, next] = parseList(lines, i, line.match(LIST)[1].length);
      out.push(html); i = next; continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|-{3,}\s*$|\s*\||>)/.test(lines[i]) && !LIST.test(lines[i])) para.push(lines[i++]);
    // a line that ends with two spaces keeps its line break
    const html = para.map((l, k) => inline(l.trim()) + (k < para.length - 1 && / {2,}$/.test(l) ? "<br />" : "")).join(" ").replace(/<br \/> /g, "<br />");
    out.push(questions && CALLOUT.test(para[0].trim()) ? `<p class="callout">${html}</p>` : `<p>${html}</p>`);
  }
  closeCard();
  return { html: out.join("\n"), headings };
}
