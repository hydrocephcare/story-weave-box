// One-off: the note page layout the way the topic page does it. The left rail is the same light list as the topic pages (no card, no tools); the tools move
// to one slim toolbar that stays under the menu while you read, with the reading progress as a thin line on it.
import fs from "node:fs";
const f = "src/pages/StaticNote.tsx";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
if (s.includes("note-toolbar")) { console.log("already done"); process.exit(0); }
const need = (x) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); };

// 1. the rail
const open = "        {railOn && parsed && (";
need(open);
const start = s.indexOf(open);
const endMark = "          </aside>\n        )}";
const end = s.indexOf(endMark, start) + endMark.length;
const rail = `        {railOn && parsed && (
          <aside className="hidden lg:block print:hidden" aria-label="On this page">
            <nav className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto border-l border-border text-[15px]">
              <p className="pl-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">On this page</p>
              <ul className="mt-3 space-y-0.5">
                {parsed.headings.map((h, i) => {
                  const here = spy.active === h.id;
                  const passed = parsed.headings.findIndex((x) => x.id === spy.active) > i;
                  return (
                    <li key={h.id}>
                      <a href={\`#\${h.id}\`} aria-current={here ? "location" : undefined} className={\`-ml-px flex items-start gap-2 border-l-2 py-1.5 pl-4 pr-2 font-medium leading-snug transition-colors hover:border-primary hover:text-foreground \${here ? "border-primary font-bold text-primary" : passed ? "border-transparent text-foreground/60" : "border-transparent text-muted-foreground"}\`}>
                        <span className="flex-1">{h.text.replace(/^\\d+\\.\\s*/, "")}</span>
                        {passed && <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>
        )}`;
s = s.slice(0, start) + rail + s.slice(end);
s = s.replace("lg:grid lg:grid-cols-[17rem_minmax(0,52rem)] lg:gap-10", "lg:grid lg:grid-cols-[13.5rem_minmax(0,52rem)] lg:gap-12");

// 2. the toolbar, first thing in the text column
const col = '        <div className="w-full min-w-0">\n';
need(col);
const bar = `        <div className="w-full min-w-0">
        {railOn && parsed && (
          <div className="note-toolbar sticky top-[4.25rem] z-20 -mx-1 mb-6 overflow-hidden rounded-xl border border-border bg-background/90 shadow-sm backdrop-blur print:hidden">
            <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 text-xs font-bold">
              <button type="button" onClick={toggleFinished} aria-pressed={finished} className={\`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors \${finished ? "bg-emerald-600 text-white" : "hover:bg-muted"}\`}><Check className="h-3.5 w-3.5" aria-hidden /> {finished ? "Finished" : "Finish"}</button>
              <button type="button" onClick={() => { toggleSaved(railUser?.id, note.slug); setSavedTick((n) => n + 1); }} aria-pressed={saved} className={\`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors \${saved ? "bg-primary/10 text-primary" : "hover:bg-muted"}\`}><Bookmark className={\`h-3.5 w-3.5 \${saved ? "fill-current" : ""}\`} aria-hidden /> {saved ? "Saved" : "Save"}</button>
              <button type="button" onClick={() => openAI(\`Quiz me on \${note.title}\`)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 hover:bg-muted"><Sparkles className="h-3.5 w-3.5" aria-hidden /> Ask AI</button>
              <button type="button" onClick={() => setExamMode((v) => !v)} aria-pressed={examMode} title="Shows only the sections examiners draw on (shortcut: E)" className={\`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors \${examMode ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "hover:bg-muted"}\`}>{examMode ? "Exam mode on" : "Exam mode"}</button>
              <span className="inline-flex overflow-hidden rounded-lg" role="group" aria-label="Text size">
                <button type="button" onClick={() => setFontStep((n) => Math.max(-2, n - 1))} className="px-2.5 py-1.5 hover:bg-muted" aria-label="Smaller text">A-</button>
                <button type="button" onClick={() => setFontStep((n) => Math.min(4, n + 1))} className="px-2.5 py-1.5 hover:bg-muted" aria-label="Larger text">A+</button>
              </span>
              <span className="ml-auto pr-2 text-muted-foreground">{finished ? "Finished" : \`\${spy.progress}% read\`}</span>
            </div>
            <div className="h-0.5 bg-muted" role="progressbar" aria-valuenow={spy.progress} aria-valuemin={0} aria-valuemax={100} aria-label="How far down this note you are"><div className="h-full bg-primary transition-[width] duration-200" style={{ width: \`\${finished ? 100 : spy.progress}%\` }} /></div>
          </div>
        )}
`;
s = s.replace(col, bar);
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("layout v4 applied");
