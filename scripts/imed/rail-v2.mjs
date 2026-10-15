// One-off: a better side rail for notes (a card with a progress ring, a contents list that ticks off the sections you passed, and a tidy toolbar),
// previous/next cards with thumbnails under the note, and a comments section. Edits StaticNote.tsx once.
import fs from "node:fs";

const f = "src/pages/StaticNote.tsx";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
if (s.includes("NoteNavCards")) { console.log("already done"); process.exit(0); }
const need = (x) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); };

s = s.replace('import { Printer, ScanLine } from "lucide-react";', 'import { ArrowUp, Check, Printer, ScanLine, Sparkles } from "lucide-react";');
s = s.replace('import ImedLinks from "@/components/ImedLinks";', 'import ImedLinks from "@/components/ImedLinks";\nimport NoteNavCards from "@/components/NoteNavCards";\nimport NoteComments from "@/components/NoteComments";');

const open = "        {railOn && parsed && (";
need(open);
const start = s.indexOf(open);
const endMark = "          </aside>\n        )}";
const end = s.indexOf(endMark, start) + endMark.length;
if (end < start) throw new Error("rail end not found");

const rail = `        {railOn && parsed && (
          <aside className="hidden lg:block print:hidden" aria-label="On this page">
            <nav className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-2xl border border-border bg-card/70 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="relative h-11 w-11 shrink-0" role="progressbar" aria-valuenow={spy.progress} aria-valuemin={0} aria-valuemax={100} aria-label="How far down this note you are">
                  <svg viewBox="0 0 36 36" className="h-11 w-11 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" className="stroke-muted" /><circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-primary transition-[stroke-dasharray] duration-300" strokeDasharray={\`\${(spy.progress / 100) * 97.4} 97.4\`} /></svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] font-extrabold">{finished ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : \`\${spy.progress}%\`}</span>
                </div>
                <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">On this page</p><p className="truncate text-sm font-bold">{finished ? "Finished" : parsed.headings.findIndex((h) => h.id === spy.active) >= 0 ? \`Section \${parsed.headings.findIndex((h) => h.id === spy.active) + 1} of \${parsed.headings.length}\` : "Start reading"}</p></div>
              </div>
              <ol className="mt-4 space-y-0.5 text-[14px]">
                {parsed.headings.map((h, i) => {
                  const here = spy.active === h.id;
                  const passed = parsed.headings.findIndex((x) => x.id === spy.active) > i;
                  return (
                    <li key={h.id}>
                      <a href={\`#\${h.id}\`} aria-current={here ? "location" : undefined} className={\`flex items-start gap-2 rounded-lg px-2 py-1.5 leading-snug transition-colors \${here ? "bg-primary/10 font-bold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}\`}>
                        <span className={\`mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] \${here ? "bg-primary text-primary-foreground" : passed ? "bg-emerald-500/15 text-emerald-600" : "border border-border"}\`}>{passed ? <Check className="h-2.5 w-2.5" aria-hidden /> : here ? "•" : ""}</span>
                        <span>{h.text.replace(/^\\d+\\.\\s*/, "")}</span>
                      </a>
                    </li>
                  );
                })}
              </ol>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4 text-xs font-bold">
                <button type="button" onClick={toggleFinished} aria-pressed={finished} className={\`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 transition-colors \${finished ? "border-emerald-600 bg-emerald-600 text-white" : "border-border hover:border-primary hover:text-primary"}\`}><Check className="h-3.5 w-3.5" aria-hidden /> {finished ? "Finished" : "Finish"}</button>
                <button type="button" onClick={() => openAI(\`Quiz me on \${note.title}\`)} className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-2 hover:border-primary hover:text-primary"><Sparkles className="h-3.5 w-3.5" aria-hidden /> Ask AI</button>
                <div className="flex overflow-hidden rounded-lg border border-border" role="group" aria-label="Text size">
                  <button type="button" onClick={() => setFontStep((n) => Math.max(-2, n - 1))} className="flex-1 px-2 py-2 hover:bg-muted" aria-label="Smaller text">A-</button>
                  <button type="button" onClick={() => setFontStep((n) => Math.min(4, n + 1))} className="flex-1 border-l border-border px-2 py-2 hover:bg-muted" aria-label="Larger text">A+</button>
                </div>
                <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-2 hover:border-primary hover:text-primary"><ArrowUp className="h-3.5 w-3.5" aria-hidden /> Top</button>
              </div>
            </nav>
          </aside>
        )}`;
s = s.slice(0, start) + rail + s.slice(end);

// previous / next cards and comments under the note, after the connected-topics block
const links = "          {!note.paper && <ImedLinks slug={note.slug} />}";
need(links);
s = s.replace(links, links + "\n          {!note.paper && <NoteNavCards slug={note.slug} />}\n          {!note.paper && <NoteComments slug={note.slug} title={note.title} />}");

fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("rail v2 applied");
