// One-off: printing keeps the note's own title and dark text; the note writer is told to use bullets (not tables) for history and examination.
import fs from "node:fs";
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const swap = (s, x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 90)); return s.replace(x, y); };

edit("src/index.css", (s) => {
  if (s.includes("header:not(:has(h1))")) return s;
  s = swap(s, '  .no-print, header, nav, footer, [role="banner"] { display: none !important; }\n  body { background: #fff !important; }', [
    '  /* the site menu and footer are left out of a printout; a page\'s own title header (the one holding the h1) stays */',
    '  .no-print, header:not(:has(h1)), nav, footer, [role="banner"] { display: none !important; }',
    '  body { background: #fff !important; }',
    '  main h1, main h2, main h3, main p, main li, main td, main th, main summary, main figcaption { color: #111 !important; opacity: 1 !important; }',
    '  .qa-hide > * { display: block !important; }',
  ].join("\n"));
  return s;
});

edit("scripts/imed/write-notes.mjs", (s) => {
  if (s.includes("not a table")) return s;
  s = swap(s, "The history questions that matter, then the examination findings and why each occurs.", "The history questions that matter, then how to examine at the bedside step by step (each named sign, how to elicit it and what it means). Use bullet lists here, not tables: the reader prefers bullets for history and examination. Use tables only for the differential diagnosis and the investigations.");
  s = swap(s, "Bullets: the tricky things examiners ask, such as ${p.traps}.", "Bullets: the key points. Then a section headed exactly \"## Tricky questions examiners ask\" with 5 to 7 questions in this form, one paragraph each: **Q1.** question text **Answer:** the answer. The tricky things examiners ask include ${p.traps}. Facts must match current guidelines: for example a diagnostic threshold is written the same way everywhere in the note.");
  return s;
});
console.log("done");
