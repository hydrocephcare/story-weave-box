// One-off: the year page leads with the year's units as folder cards (each opens that unit's notes), then the week and the timetable, with the long file library folded away.
import fs from "node:fs";
const f = "src/pages/YearHub.tsx";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
if (s.includes("year-unit-folders")) { console.log("already done"); process.exit(0); }
const need = (x) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); };

// 1. cut the long accordion of every note out of its place
const secStart = s.indexOf("      {notesForYear(parsedYear).length > 0 && (\n        <section className=\"mt-6\" aria-label={`Study notes for ${yearLabel}`}>");
need("      {notesForYear(parsedYear).length > 0 && (\n        <section className=\"mt-6\" aria-label={`Study notes for ${yearLabel}`}>");
const secEndMark = "        </section>\n      )}\n";
const secEnd = s.indexOf(secEndMark, secStart) + secEndMark.length;
s = s.slice(0, secStart) + s.slice(secEnd);

// 2. folder cards right after the header
const folders = `      {notesForYear(parsedYear).length > 0 && (
        <section className="year-unit-folders mt-8" aria-label={\`Study notes for \${yearLabel}\`}>
          <div className="mb-3 flex items-end justify-between gap-2">
            <h2 className="flex items-center gap-2 font-serif text-2xl font-bold text-foreground"><BookOpen className="h-5 w-5 text-primary" /> Study notes by unit</h2>
            <Link to={\`/notes?year=\${parsedYear}\`} className="text-sm font-bold text-primary hover:underline">Open the notes page →</Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groupNotes(notesForYear(parsedYear)).map((u) => {
              const list = u.groups.flatMap((g) => g.notes);
              return (
                <li key={u.unit}>
                  <Link to={\`/notes?year=\${parsedYear}&unit=\${encodeURIComponent(u.unit)}\`} className="group flex h-full flex-col rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md">
                    <span className="font-serif text-lg font-bold leading-tight group-hover:text-primary">{u.unit}</span>
                    <span className="mt-1 text-xs font-semibold text-muted-foreground">{u.groups.length} section{u.groups.length === 1 ? "" : "s"} · {list.length} note{list.length === 1 ? "" : "s"}</span>
                    <span className="mt-3 flex flex-wrap gap-1.5">{u.groups.slice(0, 4).map((g) => <span key={g.group} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{g.group}</span>)}{u.groups.length > 4 && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">+{u.groups.length - 4}</span>}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {parsedYear === 4 && <Link to="/imed" className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4 hover:bg-primary/10"><span><span className="block font-serif text-lg font-bold">Internal medicine, system by system</span><span className="block text-sm text-muted-foreground">Every topic with ticks, an exam planner and the question of the day.</span></span><ChevronDown className="h-5 w-5 -rotate-90 text-primary" aria-hidden /></Link>}
        </section>
      )}

`;
need('      <TaughtThisWeek year={parsedYear} className="mt-8" />');
s = s.replace('      <TaughtThisWeek year={parsedYear} className="mt-8" />', folders + '      <TaughtThisWeek year={parsedYear} className="mt-8" />');

// 3. the file library folds away
need("      <YearLibrarySection year={parsedYear} />");
s = s.replace("      <YearLibrarySection year={parsedYear} />", `      <details className="group mt-6 rounded-2xl border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span className="text-[16px] font-bold text-foreground">Course work library: textbooks, lecture slides, handouts and past papers</span>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="border-t border-border px-2 pb-4"><YearLibrarySection year={parsedYear} /></div>
      </details>`);
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("year hub redesigned");
