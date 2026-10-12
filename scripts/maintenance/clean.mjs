// Mechanical OCR / pipeline-residue cleaner. Usage: node clean.mjs <idprefix>  (dry run: prints a summary and writes out-clean-<id>.md)
import fs from "fs";

const LIG = { "ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st" };
const OPT = /^\s*\(?[a-eA-E][.)]\s/;
const BLOCK = /^\s*([#>|*\-•–—]|\d+[.)]\s|\*\*|Answer|Question|Q\d|Explanation|Note:|Marks|---)/i;

/** "stem?A. oneB. twoC. three" on one line becomes the stem and one lettered option per line. */
function splitGluedOptions(line) {
  const m = line.match(/^(.*?[?:.)])\s*A\.\s+(\S.*)$/);
  if (!m || !/^(\*\*)?\d+[.)]/.test(line.trim())) return line;
  let rest = m[2];
  const opts = [];
  let cur = "A";
  for (const L of ["B", "C", "D", "E"]) {
    const at = rest.search(new RegExp("(?<=[a-z0-9)\\.,\"'’])" + L + "\\.\\s+(?=[A-Z0-9])"));
    if (at < 0) break;
    opts.push([cur, rest.slice(0, at).trim()]);
    rest = rest.slice(at + 2).trim();
    cur = L;
  }
  if (!opts.length) return line;
  opts.push([cur, rest.replace(/\*\*.*$/, "").trim()]);
  const tail = rest.includes("**") ? "\n\n" + rest.slice(rest.indexOf("**")) : "";
  return m[1].trim() + "\n\n" + opts.map(([k, v]) => k + ". " + v).join("\n") + tail;
}

export function clean(text) {
  let t = text.replace(/\r\n/g, "\n");
  t = t.replace(/[ﬁﬂﬀﬃﬄﬅﬆ]/g, (c) => LIG[c]);
  t = t.replace(/­/g, "");
  // glued bold markers from AI chat exports: "...D) 9:3:3:1**Answer: A)...****Explanation: ..." and "**Time: 3 Hours****Total Marks: 80**"
  t = t.replace(/([^\s*\n])\*\*(Answer|Explanation|Correct answer|Rationale)\b/g, "$1\n\n**$2"); // glued bold
  t = t.replace(/\*\*\*\*(?=\s*(Answer|Explanation|Correct answer|Rationale)\b)/g, "**\n\n**");
  // bold, italic, then glued: "**Subgenus *Plasmodium****Plasmodium vivax* – ..." becomes "**Subgenus *Plasmodium***: *Plasmodium vivax* – ..."
  t = t.replace(/\*\*([^*\n]+?) \*([^*\n]+?)\*\*\*\*([^*\n]+?)\*/g, "**$1 *$2***: *$3*");
  // a label whose bold was never closed: "**Explanation: text" becomes "**Explanation:** text"
  t = t.replace(/^\*\*(Answer|Explanation|Rationale|Correct answer)([^*\n]*?):[ \t]+([^*\n]+)$/gim, "**$1$2:** $3");
  t = t.replace(/(\*\*[^*\n]+)\*\*\*\*(?=[^*\n])/g, "$1** · **");
  t = t.replace(/\*\*\*\*/g, "");
  // pipeline residue
  t = t.replace(/^.*Visual or intentionally blank source page.*$/gim, "");
  t = t.replace(/^(complete |full )?(text )?transcription of (all|the) \d+ source pages.*$/gim, "");
  t = t.replace(/^all \d+ source pages were processed\..*$/gim, "");
  t = t.replace(/^.*original page images? (remain|are) attached.*$/gim, "");
  t = t.replace(/^.*see the attached original image.*$/gim, "");
  t = t.replace(/^#+\s*Page \d+\s*[—-]\s*visual slide\s*$/gim, "");
  t = t.replace(/^#*\s*source page \d+\s*$/gim, "");
  t = t.replace(/^[A-Z][A-Za-z. ]{3,40} Page \d+\s*$/gm, "");
  // bullets
  t = t.replace(/^(\s*)[▪◦■□●]\s*/gm, (m, sp) => `${sp.length >= 2 ? "  " : ""}- `);
  t = t.replace(/(\d)�\s?C\b/g, "$1°C");
  t = t.split("\n").map(splitGluedOptions).join("\n");
  // unwrap hard-wrapped prose
  const lines = t.split("\n");
  const out = [];
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    let cur = lines[i];
    if (/^\s*```/.test(cur)) fence = !fence;
    if (!fence) {
      while (i + 1 < lines.length) {
        const nxt = lines[i + 1];
        const c = cur.trim(), n = nxt.trim();
        if (!c || !n || BLOCK.test(n) || OPT.test(n) || /^\|/.test(c) || /^#/.test(c)) break;
        const hyph = /[a-z]-$/.test(c) && /^[a-z]/.test(n);
        const wrapped = /[a-z,;(]$/.test(c) && /^[a-z(]/.test(n) && c.length > 28 && !/^(and|or)$/i.test(c);
        if (!hyph && !wrapped) break;
        cur = hyph ? c.slice(0, -1) + n : `${c} ${n}`;
        i++;
      }
    }
    out.push(cur);
  }
  t = out.join("\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").replace(/^\s*\n+/, "");
  return t.endsWith("\n") ? t : t + "\n";
}
