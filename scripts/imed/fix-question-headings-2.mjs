// Part 2: a stem that runs over several paragraphs before the options is joined into one stem, and the explanation no longer keeps a stray "**".
import fs from "node:fs";
const f = "src/lib/miniMarkdown.js";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
const swap = (x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); s = s.replace(x, y); };

const a = s.indexOf("function foldQuestionHeadings(lines) {");
const b = s.indexOf("/** Markdown to HTML. Returns { html, headings }");
if (a < 0 || b < 0) throw new Error("fold function not found");
const fn = [
  "function foldQuestionHeadings(lines) {",
  "  const out = [];",
  "  for (let i = 0; i < lines.length; i++) {",
  "    const m = lines[i].match(QUESTION_HEADING);",
  "    if (!m) { out.push(lines[i]); continue; }",
  "    let j = i + 1;",
  "    while (j < lines.length && !lines[j].trim()) j++;",
  "    if (j >= lines.length || isBlock(lines[j]) || LIST.test(lines[j])) { out.push(lines[i]); continue; }",
  "    // the stem may run over several paragraphs before the first option: join them",
  "    const stem = [];",
  "    let k = j;",
  "    while (k < lines.length && !OPT.test(lines[k]) && !isBlock(lines[k]) && !/^#{2,4}\\s/.test(lines[k])) { if (lines[k].trim()) stem.push(lines[k].trim()); k++; }",
  "    if (k < lines.length && OPT.test(lines[k]) && stem.length) { out.push(`**${m[1]}.** ${stem.join(\" \")}`, \"\"); i = k - 1; continue; }",
  "    out.push(`**${m[1]}.** ${lines[j].trim()}`);",
  "    i = j;",
  "  }",
  "  return out;",
  "}",
  "",
  "",
].join("\n");
s = s.slice(0, a) + fn + s.slice(b);
swap("const explain = why.join(\" \").replace(/\\s+/g, \" \").trim();", "const explain = why.join(\" \").replace(/\\*\\*/g, \"\").replace(/\\s+/g, \" \").trim();");
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("part 2 done");
