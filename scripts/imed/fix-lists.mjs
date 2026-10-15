// One-off: the note renderer kept numbered lists together (a list interrupted by a blank line or a table restarted at "1." every time, and indented
// answer lines fell out of their item), and "**bold with *italic* inside**" was left as raw asterisks. This fixes the renderer for every note.
import fs from "node:fs";
const f = "src/lib/miniMarkdown.js";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
const swap = (x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); s = s.replace(x, y); };

swap('  t = t.replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>");', '  t = t.replace(/\\*\\*(?=\\S)(.+?)(?<=\\S)\\*\\*/g, "<strong>$1</strong>");');

const a = s.indexOf("function parseList(lines, start, indent) {");
const b = s.indexOf("function table(rows) {");
if (a < 0 || b < 0) throw new Error("parseList");
const fn = [
  "function parseList(lines, start, indent) {",
  "  const first = lines[start].match(LIST);",
  "  const ordered = /\\d+\\./.test(first[2]);",
  "  const startAt = ordered ? parseInt(first[2], 10) : 1;",
  "  let html = \"\";",
  "  let i = start;",
  "  while (i < lines.length) {",
  "    const m = lines[i].match(LIST);",
  "    if (!m || m[1].length !== indent || /\\d+\\./.test(m[2]) !== ordered) break;",
  "    let text = m[3];",
  "    let box = \"\";",
  "    const cb = text.match(/^\\[( |x)\\]\\s+(.*)$/i);",
  "    if (cb) { box = `<input type=\"checkbox\" disabled ${cb[1].toLowerCase() === \"x\" ? \"checked \" : \"\"}/> `; text = cb[2]; }",
  "    i++;",
  "    let more = \"\";",
  "    let nested = \"\";",
  "    for (;;) {",
  "      // indented lines under an item (a model answer, a second sentence) belong to that item, also after a blank line",
  "      let j = i;",
  "      while (j < lines.length && !lines[j].trim()) j++;",
  "      const l = lines[j];",
  "      if (l === undefined) break;",
  "      const lead = l.match(/^(\\s*)/)[1].length;",
  "      const asList = l.match(LIST);",
  "      if (asList && lead > indent) { const [sub, after] = parseList(lines, j, lead); nested += sub; i = after; continue; }",
  "      if (!asList && lead > indent && !/^\\s*\\|/.test(l)) { more += `<br />${inline(l.trim())}`; i = j + 1; continue; }",
  "      // a blank line, then the next item of the same list: keep it in this list (so numbering carries on)",
  "      if (j > i && asList && lead === indent && /\\d+\\./.test(asList[2]) === ordered) i = j;",
  "      break;",
  "    }",
  "    html += `<li>${box}${inline(text)}${more}${nested}</li>`;",
  "  }",
  "  const tag = ordered ? \"ol\" : \"ul\";",
  "  return [`<${tag}${ordered && startAt !== 1 ? ` start=\"${startAt}\"` : \"\"}>${html}</${tag}>`, i];",
  "}",
  "",
  "",
].join("\n");
s = s.slice(0, a) + fn + s.slice(b);
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("renderer fixed");
