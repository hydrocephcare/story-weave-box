// One-off: the note rail gets wider, the progress ring moves to the bottom of the card, a save-for-later button is added, and progress is synced to the account.
import fs from "node:fs";

const f = "src/pages/StaticNote.tsx";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
if (s.includes("pullProgress")) { console.log("already done"); process.exit(0); }
const need = (x) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); };
const swap = (x, y) => { need(x); s = s.replace(x, y); };

swap('import { ArrowUp, Check, Printer, ScanLine, Sparkles } from "lucide-react";', 'import { ArrowUp, Bookmark, Check, Printer, ScanLine, Sparkles } from "lucide-react";');
swap('import { savePlace, scheduleReview } from "@/lib/noteProgress";', 'import { savePlace, scheduleReview } from "@/lib/noteProgress";\nimport { pullProgress, pushProgress } from "@/lib/progressSync";\nimport { isSaved, toggleSaved } from "@/lib/savedNotes";');

// sync: pull once per sign-in, push when progress or the finished tick changes
swap("  const [doneTick, setDoneTick] = useState(0);", `  const [doneTick, setDoneTick] = useState(0);
  const [savedTick, setSavedTick] = useState(0);
  useEffect(() => { void pullProgress(railUser?.id).then(() => setDoneTick((n) => n + 1)); }, [railUser?.id]);`);
swap("    setDoneTick((n) => n + 1);\n  };", "    setDoneTick((n) => n + 1);\n    window.setTimeout(() => { try { pushProgress(railUser?.id, note.slug, { progress: spy.progress, finished: (JSON.parse(localStorage.getItem(finishedKey) ?? \"[]\") as string[]).includes(note.slug) }); } catch { /* ignore */ } }, 0);\n  };");
swap("savePlace(railUser?.id, { slug: note.slug, title: note.title, progress: spy.progress }), 600);", "{ savePlace(railUser?.id, { slug: note.slug, title: note.title, progress: spy.progress }); pushProgress(railUser?.id, note.slug, { progress: spy.progress, finished }); }, 600);");
swap("  const nextNote = (() =>", "  const saved = (() => { void savedTick; return note ? isSaved(railUser?.id, note.slug) : false; })();\n  const nextNote = (() =>");

// wider rail
swap("lg:grid lg:grid-cols-[13.5rem_minmax(0,52rem)] lg:gap-12", "lg:grid lg:grid-cols-[17rem_minmax(0,52rem)] lg:gap-10");

// the card: contents first, tools, and the progress ring at the bottom
const open = "        {railOn && parsed && (";
need(open);
const start = s.indexOf(open);
const endMark = "          </aside>\n        )}";
const end = s.indexOf(endMark, start) + endMark.length;
const rail = `        {railOn && parsed && (
          <aside className="hidden lg:block print:hidden" aria-label="On this page">
            <nav className="sticky top-24 flex max-h-[calc(100dvh-7rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card/70 shadow-sm">
              <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">On this page</p>
                <button type="button" onClick={() => { toggleSaved(railUser?.id, note.slug); setSavedTick((n) => n + 1); }} aria-pressed={saved} aria-label={saved ? "Remove from saved notes" : "Save this note for later"} title={saved ? "Saved" : "Save for later"} className={\`rounded-lg p-1.5 transition-colors \${saved ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}\`}><Bookmark className={\`h-4 w-4 \${saved ? "fill-current" : ""}\`} aria-hidden /></button>
              </div>
              <ol className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-2 text-[15px]">
                {parsed.headings.map((h, i) => {
                  const here = spy.active === h.id;
                  const passed = parsed.headings.findIndex((x) => x.id === spy.active) > i;
                  return (
                    <li key={h.id}>
                      <a href={\`#\${h.id}\`} aria-current={here ? "location" : undefined} className={\`flex items-start gap-2.5 rounded-lg px-2.5 py-2 leading-snug transition-colors \${here ? "bg-primary/10 font-bold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}\`}>
                        <span className={\`mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] \${here ? "bg-primary text-primary-foreground" : passed ? "bg-emerald-500/15 text-emerald-600" : "border border-border"}\`}>{passed ? <Check className="h-2.5 w-2.5" aria-hidden /> : here ? "•" : ""}</span>
                        <span>{h.text.replace(/^\\d+\\.\\s*/, "")}</span>
                      </a>
                    </li>
                  );
                })}
              </ol>
              <div className="grid grid-cols-2 gap-2 border-t border-border px-4 pt-3 text-xs font-bold">
                <button type="button" onClick={toggleFinished} aria-pressed={finished} className={\`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 transition-colors \${finished ? "border-emerald-600 bg-emerald-600 text-white" : "border-border hover:border-primary hover:text-primary"}\`}><Check className="h-3.5 w-3.5" aria-hidden /> {finished ? "Finished" : "Finish"}</button>
                <button type="button" onClick={() => openAI(\`Quiz me on \${note.title}\`)} className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-2 hover:border-primary hover:text-primary"><Sparkles className="h-3.5 w-3.5" aria-hidden /> Ask AI</button>
                <div className="flex overflow-hidden rounded-lg border border-border" role="group" aria-label="Text size">
                  <button type="button" onClick={() => setFontStep((n) => Math.max(-2, n - 1))} className="flex-1 px-2 py-2 hover:bg-muted" aria-label="Smaller text">A-</button>
                  <button type="button" onClick={() => setFontStep((n) => Math.min(4, n + 1))} className="flex-1 border-l border-border px-2 py-2 hover:bg-muted" aria-label="Larger text">A+</button>
                </div>
                <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-2 hover:border-primary hover:text-primary"><ArrowUp className="h-3.5 w-3.5" aria-hidden /> Top</button>
              </div>
              <div className="flex items-center gap-3 px-5 pb-4 pt-3" role="progressbar" aria-valuenow={spy.progress} aria-valuemin={0} aria-valuemax={100} aria-label="How far down this note you are">
                <div className="relative h-9 w-9 shrink-0">
                  <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" className="stroke-muted" /><circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" strokeLinecap="round" className="stroke-primary transition-[stroke-dasharray] duration-300" strokeDasharray={\`\${(spy.progress / 100) * 97.4} 97.4\`} /></svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold">{finished ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : spy.progress}</span>
                </div>
                <p className="text-sm font-bold">{finished ? "Finished" : \`Section \${Math.max(1, parsed.headings.findIndex((h) => h.id === spy.active) + 1)} of \${parsed.headings.length}\`}<span className="block text-[11px] font-semibold text-muted-foreground">{spy.progress}% read</span></p>
              </div>
            </nav>
          </aside>
        )}`;
s = s.slice(0, start) + rail + s.slice(end);
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("rail v3 applied");
