// One-off: the "cross-checked by a second AI" mark was only in the past-paper header; it now also sits in the note header (under the description). The revealed answer of a
// practice question no longer repeats the option text.
import fs from "node:fs";
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const swap = (s, x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); return s.replace(x, y); };

edit("src/pages/StaticNote.tsx", (s) => {
  if (s.includes("checked-badge")) return s;
  return swap(s, "{note.description}</p>\n            {text && text.length > 400 && <StudyTools", [
    "{note.description}</p>",
    "            {(contentMarks as { notes: Record<string, string> }).notes[note.slug] && <p data-testid=\"checked-badge\" className=\"mt-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300\"><ShieldCheck className=\"h-3.5 w-3.5\" aria-hidden /> Cross-checked by a second AI on {new Date((contentMarks as { notes: Record<string, string> }).notes[note.slug]).toLocaleDateString(undefined, { day: \"numeric\", month: \"long\", year: \"numeric\" })} · not a doctor’s review</p>}",
    "            {text && text.length > 400 && <StudyTools",
  ].join("\n"));
});

edit("src/lib/miniMarkdown.js", (s) => {
  if (s.includes("sameAsOption")) return s;
  return swap(s, "    if (a[2]) why.push(", "    const sameAsOption = (t) => { const o = opts.find((x) => x[0] === letter); const n = (v) => String(v ?? \"\").toLowerCase().replace(/[^a-z0-9]+/g, \"\"); return Boolean(o) && n(t).length > 0 && n(o[1]).startsWith(n(t).slice(0, 24)); };\n    if (a[2] && !sameAsOption(a[2])) why.push(");
});
console.log("badge + duplicate answer fixed");
