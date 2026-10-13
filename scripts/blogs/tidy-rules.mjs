// Layout fixes by rule, no AI: tidy headings, remove stray blank lines inside lists, indent items under their label,
// fix missing spaces. The words never change.
const isItem = (l) => /^\s*(?:[-*]|\d+[.)])\s+/.test(l);

export function tidy(src) {
  let t = src.replace(/\r/g, "").replace(/[ \t]+$/gm, "");
  // "### **Causes**:"  ->  "### Causes"
  t = t.replace(/^(#{1,6})\s*\*\*(.+?)\*\*\s*:?\s*$/gm, "$1 $2").replace(/^(#{1,6})\s+(.+?):\s*$/gm, "$1 $2");
  // a note with almost no headings but bold lines standing alone: those bold lines are its headings
  if ((t.match(/^#{1,6} /gm) ?? []).length < 2) t = t.replace(/^\s*\*\*([^*\n]{3,80}?)\*\*:?\s*$/gm, "## $1");
  // blank lines between list items are removed; items that followed a label ("- **Causes**:") are indented under it
  const lines = t.split("\n"), out = [];
  let nest = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== "") {
      const l = lines[i];
      out.push(nest && /^[-*]\s+/.test(l) ? "    " + l : l);
      continue;
    }
    let j = i; while (j < lines.length && lines[j].trim() === "") j++;
    const prev = (out[out.length - 1] ?? "").trim(), next = lines[j] ?? "", k = j - i;
    const label = /^[-*]\s+.*(:|:\*\*)\s*$/.test(prev);
    if (isItem(next) && label) { nest = /^[-*]\s+/.test(next); i = j - 1; continue; }
    if (isItem(next) && isItem(prev) && k < 2) { i = j - 1; continue; }
    nest = false; out.push(""); i = j - 1;
  }
  t = out.join("\n");
  // "**Label**:Text" -> "**Label**: Text", "due to:**Overeating**" -> "due to: **Overeating**", "end.Next" -> "end. Next"
  t = t.replace(/(\*\*[^*\n]+?\*\*:)(?=[A-Za-z0-9(])/g, "$1 ").replace(/([a-z]):(?=\*\*[A-Z])/g, "$1: ").replace(/([a-z)])\.([A-Z][a-z])/g, "$1. $2");
  t = t.replace(/^\s*---\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  // headings start at "##"
  t = t.replace(/^# (?!#)/gm, "## ");
  // a lone title heading above several "###" sections repeats the page title: drop it and lift the sections
  const h2 = (t.match(/^## /gm) ?? []).length, h3 = (t.match(/^### /gm) ?? []).length;
  if (h2 === 1 && h3 >= 2) {
    const first = t.split("\n").find((l) => l.trim() !== "");
    if (/^## /.test(first ?? "")) t = t.replace(/^## .*\n+/m, "");
    t = t.replace(/^(#{3,6}) /gm, (m, h) => "#".repeat(h.length - 1) + " ");
  }
  const levels = [...t.matchAll(/^(#{1,6})\s/gm)].map((m) => m[1].length);
  if (levels.length && Math.min(...levels) > 2) {
    const up = Math.min(...levels) - 2;
    t = t.replace(/^(#{1,6})(\s)/gm, (m, h, sp) => "#".repeat(Math.max(2, h.length - up)) + sp);
  }
  return t + "\n";
}
