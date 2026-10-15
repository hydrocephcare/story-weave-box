// One-off: exam mode and keyboard shortcuts on notes; question of the day and "new and updated" on the hub and the notes page.
import fs from "node:fs";
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const swap = (s, x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 90)); return s.replace(x, y); };

edit("src/pages/StaticNote.tsx", (s) => {
  if (s.includes("examOnly")) return s;
  s = swap(s, 'import { isSaved, toggleSaved } from "@/lib/savedNotes";', 'import { isSaved, toggleSaved } from "@/lib/savedNotes";\nimport { examOnly } from "@/lib/examMode";');
  // state and shortcuts
  s = swap(s, "  const [savedTick, setSavedTick] = useState(0);", `  const [savedTick, setSavedTick] = useState(0);
  const [examMode, setExamMode] = useState(() => { try { return localStorage.getItem("ompath_exam_mode") === "1"; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem("ompath_exam_mode", examMode ? "1" : "0"); } catch { /* ignore */ } }, [examMode]);`);
  // the article shows the exam cut when exam mode is on
  s = swap(s, "dangerouslySetInnerHTML={{ __html: linked.html }}", "dangerouslySetInnerHTML={{ __html: examMode && !note.paper ? examOnly(linked.html) : linked.html }}");
  // a toggle under the toolbar
  s = swap(s, '              <div className="flex items-center gap-3 px-5 pb-4 pt-3" role="progressbar"', `              <button type="button" onClick={() => setExamMode((v) => !v)} aria-pressed={examMode} title="Shows only the sections examiners draw on (shortcut: E)" className={\`mx-4 mt-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors \${examMode ? "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300" : "border-border hover:border-primary hover:text-primary"}\`}>{examMode ? "Exam mode on: high-yield only" : "Exam mode: high-yield only"}</button>
              <div className="flex items-center gap-3 px-5 pb-4 pt-3" role="progressbar"`);
  // keyboard shortcuts: J / K sections, F finish, S save, E exam mode
  s = swap(s, "  const nextNote = (() =>", `  useEffect(() => {
    if (!note || note.paper || !parsed) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) return;
      const k = e.key.toLowerCase();
      const ids = parsed.headings.map((h) => h.id);
      const at = Math.max(0, ids.indexOf(spy.active));
      if (k === "j" || k === "k") {
        const go = ids[Math.max(0, Math.min(ids.length - 1, at + (k === "j" ? 1 : -1)))];
        document.getElementById(go)?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (k === "f") toggleFinished();
      else if (k === "s") { toggleSaved(railUser?.id, note.slug); setSavedTick((n) => n + 1); }
      else if (k === "e") setExamMode((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note, parsed, spy.active, railUser?.id]);
  const nextNote = (() =>`);
  return s;
});

edit("src/pages/Imed.tsx", (s) => {
  if (s.includes("DailyQuestion")) return s;
  s = swap(s, 'import { useAuth } from "@/hooks/useAuth";', 'import { useAuth } from "@/hooks/useAuth";\nimport DailyQuestion from "@/components/DailyQuestion";');
  s = swap(s, '      <section className="mt-6 space-y-3" aria-label="Your study plan">', '      <DailyQuestion className="mt-6" />\n\n      <section className="mt-6 space-y-3" aria-label="Your study plan">');
  return s;
});

edit("src/pages/StaticNotesIndex.tsx", (s) => {
  if (s.includes("DailyQuestion")) return s;
  s = swap(s, 'import { unfinished } from "@/lib/noteProgress";', 'import { unfinished } from "@/lib/noteProgress";\nimport DailyQuestion from "@/components/DailyQuestion";');
  s = swap(s, "  const imedWritten = ", "  const fresh = useMemo(() => [...NOTES].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 5), []);\n  const imedWritten = ");
  s = swap(s, '      <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Year">', `      <DailyQuestion className="mt-5" />

      <section className="mt-5" aria-label="New and updated">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">New and updated</p>
        <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">{fresh.map((n) => <li key={n.slug} className="shrink-0"><Link to={\`/notes/\${n.slug}\`} className="block max-w-[15rem] rounded-xl border border-border bg-card px-3 py-2 hover:border-primary/60"><span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Year {n.year} · {n.group ?? n.unit}</span><span className="line-clamp-2 block text-sm font-semibold leading-snug">{n.title}</span></Link></li>)}</ul>
      </section>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Year">`);
  return s;
});
console.log("features 2 applied");
