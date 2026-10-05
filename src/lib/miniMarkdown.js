// A small markdown renderer for notes that ship with the site. It is plain JavaScript so the build-time
// prerender (Node) and the app (browser) produce the same HTML. It handles what the notes use:
// headings, paragraphs, bold/italic/code, bullet and numbered lists (nested), checkbox lists, tables and rules.
// Everything is escaped first, so a note can never inject markup.

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const slugify = (s) => String(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function inline(text) {
  let t = esc(text);
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

/** Markdown to HTML. Returns { html, headings } where headings lists the ## sections for a table of contents. */
export function mdToHtml(source, { skipTitle = false } = {}) {
  const lines = String(source).replace(/\r\n/g, "\n").split("\n");
  if (skipTitle) { const first = lines.findIndex((l) => l.trim()); if (first >= 0 && /^#\s/.test(lines[first])) lines.splice(first, 1); }
  const out = [];
  const headings = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const id = slugify(h[2].replace(/\*+/g, ""));
      if (level === 2) headings.push({ id, text: h[2].replace(/\*+/g, "") });
      out.push(`<h${level} id="${id}">${inline(h[2])}</h${level}>`);
      i++; continue;
    }
    if (/^-{3,}\s*$/.test(line)) { out.push("<hr />"); i++; continue; }
    if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      out.push(table(rows)); continue;
    }
    if (LIST.test(line)) {
      const [html, next] = parseList(lines, i, line.match(LIST)[1].length);
      out.push(html); i = next; continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|-{3,}\s*$|\s*\|)/.test(lines[i]) && !LIST.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return { html: out.join("\n"), headings };
}
