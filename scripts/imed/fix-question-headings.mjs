// One-off: practice questions written as "### Question 1" + a stem + options on their own lines + "**Answer:** B. ..." were shown as one run-together paragraph with the
// answer open, because only "**1.** stem" was read as a question. The renderer now turns the "### Question N" form into the same tappable card (answer behind a button).
import fs from "node:fs";
const f = "src/lib/miniMarkdown.js";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
if (s.includes("QUESTION_HEADING")) { console.log("already done"); process.exit(0); }
const swap = (x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); s = s.replace(x, y); };

swap("/** Markdown to HTML. Returns { html, headings }", [
  "// \"### Question 3\" on its own line, then the stem, the options (one per line) and the answer: read as the question \"**3.** stem\" so it becomes a card",
  "const QUESTION_HEADING = /^#{3,4}\\s+Question\\s+(\\d{1,3})\\s*$/i;",
  "function foldQuestionHeadings(lines) {",
  "  const out = [];",
  "  for (let i = 0; i < lines.length; i++) {",
  "    const m = lines[i].match(QUESTION_HEADING);",
  "    if (!m) { out.push(lines[i]); continue; }",
  "    let j = i + 1;",
  "    while (j < lines.length && !lines[j].trim()) j++;",
  "    if (j >= lines.length || isBlock(lines[j]) || LIST.test(lines[j])) { out.push(lines[i]); continue; }",
  "    out.push(`**${m[1]}.** ${lines[j].trim()}`);",
  "    i = j;",
  "  }",
  "  return out;",
  "}",
  "",
  "/** Markdown to HTML. Returns { html, headings }",
].join("\n"));
swap("  const lines = String(source).replace(/\\r\\n/g, \"\\n\").split(\"\\n\");\n  if (skipTitle)", "  let lines = String(source).replace(/\\r\\n/g, \"\\n\").split(\"\\n\");\n  if (questions) lines = foldQuestionHeadings(lines);\n  if (skipTitle)");
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("question headings folded");
