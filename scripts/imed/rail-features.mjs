// One-off: the "On this page" rail of notes and topic pages follows the reader (the current section is highlighted and a progress bar fills),
// and the note rail gets tools: mark as finished, ask Ompath AI, next note, back to top. Edits StaticNote.tsx and TopicPage.tsx once.
import fs from "node:fs";

function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const need = (s, x) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); };

edit("src/pages/StaticNote.tsx", (s) => {
  if (s.includes("useScrollSpy")) { console.log("note rail already done"); return s; }
  need(s, 'import ImedLinks from "@/components/ImedLinks";');
  s = s.replace('import ImedLinks from "@/components/ImedLinks";', 'import ImedLinks from "@/components/ImedLinks";\nimport { useScrollSpy } from "@/hooks/useScrollSpy";\nimport { openAI } from "@/lib/aiEvents";\nimport { topicForNote } from "@/data/imed";\nimport { doneTopics, toggleTopic } from "@/lib/imedProgress";\nimport { useAuth } from "@/hooks/useAuth";');
  const anchor = "  const railOn = ";
  need(s, anchor);
  s = s.replace(anchor, `  const { user: railUser } = useAuth();
  const spy = useScrollSpy(parsed ? parsed.headings.map((h) => h.id) : []);
  const [doneTick, setDoneTick] = useState(0);
  const imedTopic = note ? topicForNote(note.slug) : null;
  const finishedKey = \`ompath_note_done_\${railUser?.id ?? "guest"}\`;
  const finished = (() => { void doneTick; try { if (imedTopic && doneTopics(railUser?.id).has(imedTopic.topic.id)) return true; return (JSON.parse(localStorage.getItem(finishedKey) ?? "[]") as string[]).includes(note?.slug ?? ""); } catch { return false; } })();
  const toggleFinished = () => {
    if (!note) return;
    try {
      if (imedTopic) toggleTopic(railUser?.id, imedTopic.topic.id);
      const list = new Set(JSON.parse(localStorage.getItem(finishedKey) ?? "[]") as string[]);
      if (list.has(note.slug)) list.delete(note.slug); else list.add(note.slug);
      localStorage.setItem(finishedKey, JSON.stringify([...list]));
    } catch { /* storage blocked */ }
    setDoneTick((n) => n + 1);
  };
  const nextNote = (() => { if (!note) return null; const all = STATIC_NOTES.filter((n) => n.unit === note.unit && n.group === note.group && !n.paper); const i = all.findIndex((n) => n.slug === note.slug); return i >= 0 ? all[i + 1] ?? null : null; })();
` + anchor);
  // highlight the current section
  need(s, 'className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 leading-snug text-muted-foreground hover:border-primary hover:text-primary"');
  s = s.replace('className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 leading-snug text-muted-foreground hover:border-primary hover:text-primary"', 'aria-current={spy.active === h.id ? "location" : undefined} className={`-ml-px block border-l-2 py-1.5 pl-4 leading-snug transition-colors hover:border-primary hover:text-primary ${spy.active === h.id ? "border-primary font-bold text-primary" : "border-transparent text-muted-foreground"}`}');
  // progress and tools under the list
  need(s, "              </ol>\n            </nav>\n          </aside>");
  s = s.replace("              </ol>\n            </nav>\n          </aside>", `              </ol>
              <div className="mt-5 pl-4 pr-1">
                <div className="flex items-center justify-between text-xs font-bold text-muted-foreground"><span>Reading</span><span>{spy.progress}%</span></div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={spy.progress} aria-valuemin={0} aria-valuemax={100} aria-label="How far down this note you are"><div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: \`\${spy.progress}%\` }} /></div>
                <button type="button" onClick={toggleFinished} aria-pressed={finished} className={\`mt-4 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition-colors \${finished ? "border-emerald-600 bg-emerald-600 text-white" : "border-border hover:border-primary hover:text-primary"}\`}>{finished ? "Finished ✓" : "Mark as finished"}</button>
                <button type="button" onClick={() => openAI(\`Quiz me on \${note.title}\`)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-bold hover:border-primary hover:text-primary">Ask Ompath AI</button>
                {nextNote && <Link to={\`/notes/\${nextNote.slug}\`} className="mt-2 block rounded-lg bg-primary/10 px-3 py-2 text-sm font-bold text-primary hover:bg-primary/15">Next: {nextNote.title} →</Link>}
                <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="mt-2 block w-full px-1 text-left text-xs font-bold text-muted-foreground hover:text-primary">↑ Back to top</button>
              </div>
            </nav>
          </aside>`);
  return s;
});

edit("src/pages/TopicPage.tsx", (s) => {
  if (s.includes("useScrollSpy")) { console.log("topic rail already done"); return s; }
  const imp = 'import { useReadLog } from "@/lib/readLog";';
  need(s, imp);
  s = s.replace(imp, imp + '\nimport { useScrollSpy } from "@/hooks/useScrollSpy";');
  const anchor = "  const [zoom, setZoom] = useState<number | null>(null);";
  need(s, anchor);
  // toc is defined later in the component, so the hook is called where toc exists
  const tocLine = s.indexOf("<aside className=\"hidden lg:block\">");
  need(s, 'className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 font-medium text-muted-foreground hover:border-primary hover:text-foreground"');
  s = s.replace('className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 font-medium text-muted-foreground hover:border-primary hover:text-foreground"', 'aria-current={spy.active === t.id ? "location" : undefined} className={`-ml-px block border-l-2 py-1.5 pl-4 font-medium transition-colors hover:border-primary hover:text-foreground ${spy.active === t.id ? "border-primary font-bold text-primary" : "border-transparent text-muted-foreground"}`}');
  return s;
});
console.log("rail features applied (topic page hook still to place)");
