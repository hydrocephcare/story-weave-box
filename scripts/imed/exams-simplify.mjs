// One-off: the exams page, simpler. No price label, no unit chip row, plain cards with the title, the unit and one button.
import fs from "node:fs";
const f = "src/pages/Exams.tsx";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
if (s.includes("exam-simple")) { console.log("already done"); process.exit(0); }
const cut = (from, to, replacement = "") => {
  const a = s.indexOf(from);
  if (a < 0) throw new Error("missing: " + from.slice(0, 70));
  const b = s.indexOf(to, a);
  if (b < 0) throw new Error("missing end: " + to.slice(0, 70));
  s = s.slice(0, a) + replacement + s.slice(b + to.length);
};

// the price label
cut('          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-rose-200', "</p>\n");
// the unit chips row
cut('        {unitChips.length > 1 && (', "        )}\n");
// the cards
cut('                <article key={exam.id}', "                </article>\n", `                <article key={exam.id} className="exam-simple flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">{unitName}{yearTag ? \` · \${yearTag}\` : ""}</p>
                  <h2 className="mt-1 font-serif text-lg font-bold leading-snug text-foreground">{exam.title}</h2>
                  <div className="mt-auto pt-4"><Button size="sm" onClick={() => navigate(isSample ? \`/exams/\${exam.id}/start\` : buildExamPath(exam))} className="gap-1.5">Start exam <ArrowRight className="h-3.5 w-3.5" /></Button></div>
                </article>
`);
s = s.replace("Timed multiple-choice exams from your unit content, marked at the end with the answers explained.", "Timed multiple-choice exams from your units. You get your score and the answers at the end.");
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("exams simplified");
