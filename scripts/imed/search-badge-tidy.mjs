// One-off: (1) the cross-check mark says just "Cross-checked" with a badge icon (the detail is a tooltip); (2) a search that offers "Read about ..." no longer also says "Nothing found".
import fs from "node:fs";
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const swap = (s, x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); return s.replace(x, y); };

edit("src/pages/StaticNote.tsx", (s) => {
  if (s.includes("BadgeCheck")) return s;
  s = swap(s, "ScanLine, ShieldCheck, Sparkles }", "BadgeCheck, ScanLine, Sparkles }");
  const mark = "(contentMarks as { notes: Record<string, string> }).notes[note.slug]";
  const when = "new Date(" + mark + ").toLocaleDateString(undefined, { day: \"numeric\", month: \"long\", year: \"numeric\" })";
  // both headers: a short badge, the detail in the tooltip
  let n = 0;
  s = s.replace(/\{\(contentMarks as \{ notes: Record<string, string> \}\)\.notes\[note\.slug\] && <p [^\n]*?not a doctor’s review<\/p>\}/g, () => {
    n++;
    return "{" + mark + " && <p data-testid=\"checked-badge\" title={`Cross-checked by a second AI on ${" + when + "}. Not a doctor’s review.`} className=\"mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300\"><BadgeCheck className=\"h-4 w-4\" aria-hidden /> Cross-checked</p>}";
  });
  if (n < 2) throw new Error("badges replaced: " + n);
  return s;
});

edit("src/pages/GlobalSearch.tsx", (s) => {
  if (s.includes("const readAbout")) return s;
  s = swap(s, "} searched && hits.length === 0 && topicHits.length > 0 ? null :".replace("} ", ""), "searched && hits.length === 0 && (topicHits.length > 0 || readAbout) ? null :");
  // the same test the "Read about" link uses
  const at = s.indexOf("  return (");
  if (at < 0) throw new Error("return not found");
  s = s.slice(0, at) + "  const readAbout = topicHits.length === 0 && Boolean(topicIndex) && q.trim().length >= 4 && /^[A-Za-z][A-Za-z0-9 '’()\\-,./&]{3,70}$/.test(q.trim());\n" + s.slice(at);
  return s;
});
console.log("tidied");
