// Mechanical OCR / pipeline-residue cleaner. Usage: node clean.mjs <idprefix>  (dry run: prints a summary and writes out-clean-<id>.md)
import fs from "fs";

const LIG = { "ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st" };
const OPT = /^\s*\(?[a-eA-E][.)]\s/;
const BLOCK = /^\s*([#>|*\-•–—]|\d+[.)]\s|\*\*|Answer|Question|Q\d|Explanation|Note:|Marks|---)/i;

export function clean(text) {
  let t = text.replace(/\r\n/g, "\n");
  t = t.replace(/[ﬁﬂﬀﬃﬄﬅﬆ]/g, (c) => LIG[c]);
  t = t.replace(/­/g, "");
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
