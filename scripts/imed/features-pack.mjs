// One-off: study features. Notes remember where you stopped and offer "continue reading"; finishing a note schedules reviews; the internal medicine hub gets
// an exam-date planner, due reviews, a filter; the note rail gets a text-size control.
import fs from "node:fs";

function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const need = (s, x) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 90)); };
const swap = (s, x, y) => { need(s, x); return s.replace(x, y); };

// ---------- the note page ----------
edit("src/pages/StaticNote.tsx", (s) => {
  if (s.includes("savePlace")) { console.log("note page already done"); return s; }
  s = swap(s, 'import { useScrollSpy } from "@/hooks/useScrollSpy";', 'import { useScrollSpy } from "@/hooks/useScrollSpy";\nimport { savePlace, scheduleReview } from "@/lib/noteProgress";');
  // remember the place, at most twice a second
  s = swap(s, "  const [doneTick, setDoneTick] = useState(0);", `  const [doneTick, setDoneTick] = useState(0);
  const [fontStep, setFontStep] = useState(() => { try { return Number(localStorage.getItem("ompath_note_font") ?? 0) || 0; } catch { return 0; } });
  useEffect(() => { try { localStorage.setItem("ompath_note_font", String(fontStep)); } catch { /* ignore */ } }, [fontStep]);
  useEffect(() => { if (!note || note.paper || !parsed) return; const t = window.setTimeout(() => savePlace(railUser?.id, { slug: note.slug, title: note.title, progress: spy.progress }), 600); return () => window.clearTimeout(t); }, [spy.progress, note, parsed, railUser?.id]);`);
  // finishing a note books its reviews
  s = swap(s, "      if (list.has(note.slug)) list.delete(note.slug); else list.add(note.slug);", "      if (list.has(note.slug)) list.delete(note.slug); else { list.add(note.slug); scheduleReview(railUser?.id, { slug: note.slug, title: note.title }); }");
  // text size on the article
  s = swap(s, '<article className={`note-body mt-6 ${note.paper ? "" : "note-topic"}`}', '<article style={note.paper ? undefined : { fontSize: `${1 + fontStep * 0.0625}em` }} className={`note-body mt-6 ${note.paper ? "" : "note-topic"}`}');
  // the control in the rail
  s = swap(s, '                <button type="button" onClick={toggleFinished}', `                <div className="flex items-center justify-between gap-2" role="group" aria-label="Text size"><span className="text-xs font-bold text-muted-foreground">Text size</span><span className="flex gap-1"><button type="button" onClick={() => setFontStep((n) => Math.max(-2, n - 1))} className="h-8 w-8 rounded-md border border-border text-sm font-bold hover:border-primary hover:text-primary" aria-label="Smaller text">A-</button><button type="button" onClick={() => setFontStep((n) => Math.min(4, n + 1))} className="h-8 w-8 rounded-md border border-border text-sm font-bold hover:border-primary hover:text-primary" aria-label="Larger text">A+</button></span></div>
                <button type="button" onClick={toggleFinished}`);
  return s;
});

// ---------- the internal medicine hub ----------
edit("src/pages/Imed.tsx", (s) => {
  if (s.includes("dueReviews")) { console.log("hub already done"); return s; }
  s = swap(s, 'import { useAuth } from "@/hooks/useAuth";', 'import { useAuth } from "@/hooks/useAuth";\nimport { completeReview, daysUntil, dueReviews, getExamDate, perDay, setExamDate, unfinished } from "@/lib/noteProgress";');
  s = swap(s, "  const total = IMED.reduce(", `  const [exam, setExam] = useState(() => getExamDate(user?.id));
  const [q, setQ] = useState("");
  const [onlyLeft, setOnlyLeft] = useState(false);
  const place = useMemo(() => unfinished(user?.id), [user?.id, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const due = useMemo(() => dueReviews(user?.id), [user?.id, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const left = IMED.flatMap((sys) => sys.topics).filter((t) => isPublished(t) && !done.has(t.id));
  const rate = perDay(left.length, exam);
  const countdown = daysUntil(exam);
  const total = IMED.reduce(`);
  s = swap(s, '      <div className="mt-8 space-y-3">', `      <section className="mt-6 space-y-3" aria-label="Your study plan">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Exam planner</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="text-sm font-semibold" htmlFor="imed-exam">My exam is on</label>
            <input id="imed-exam" type="date" value={exam} onChange={(e) => { setExam(e.target.value); setExamDate(user?.id, e.target.value); }} className="h-10 rounded-lg border border-border bg-background px-3 text-sm" />
          </div>
          {rate ? <p className="mt-2 text-[15px]"><b>{countdown} days</b> to go and <b>{left.length}</b> topics left: read <b>{rate} topic{rate === 1 ? "" : "s"} a day</b>. Today: {left.slice(0, rate).map((t, i) => <span key={t.id}>{i ? ", " : ""}{t.note ? <Link to={\`/notes/\${t.note}\`} className="font-semibold text-primary hover:underline">{t.name}</Link> : t.name}</span>)}.</p> : <p className="mt-2 text-sm text-muted-foreground">Pick your exam date and the plan works out how many topics to read each day, and which ones come next.</p>}
        </div>
        {place.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Continue reading</p>
            <ul className="mt-2 space-y-1.5">{place.map((p) => <li key={p.slug}><Link to={\`/notes/\${p.slug}\`} className="flex items-center justify-between gap-3 text-[15px] font-semibold hover:text-primary"><span className="min-w-0 truncate">{p.title}</span><span className="shrink-0 text-xs font-bold text-muted-foreground">{p.progress}%</span></Link></li>)}</ul>
          </div>
        )}
        {due.length > 0 && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">Due for a second look</p>
            <p className="text-sm text-muted-foreground">Notes you finished, coming back after 3, 7 and 21 days so they stay.</p>
            <ul className="mt-2 space-y-2">{due.slice(0, 5).map((r) => <li key={r.slug} className="flex flex-wrap items-center justify-between gap-2"><Link to={\`/notes/\${r.slug}\`} className="font-semibold hover:text-primary">{r.title}</Link><button type="button" onClick={() => { completeReview(user?.id, r.slug); setTick((x) => x + 1); }} className="rounded-full border border-border px-3 py-1 text-xs font-bold hover:border-primary hover:text-primary">I have reviewed it</button></li>)}</ul>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a topic, e.g. meningitis" aria-label="Find a topic" className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm" />
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={onlyLeft} onChange={(e) => setOnlyLeft(e.target.checked)} /> Only topics I have not finished</label>
        </div>
      </section>

      <div className="mt-6 space-y-3">`);
  // the filter: a search or "only unfinished" opens every folder and hides the rest
  s = swap(s, "          const isOpen = open === s.id;", "          const filtering = Boolean(q.trim()) || onlyLeft;\n          const shown = s.topics.filter((t) => (!q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase())) && (!onlyLeft || !done.has(t.id)));\n          if (filtering && shown.length === 0) return null;\n          const isOpen = filtering || open === s.id;");
  s = swap(s, "                  {s.topics.map((t) => {", "                  {(filtering ? shown : s.topics).map((t) => {");
  return s;
});

// ---------- the notes index: continue reading ----------
edit("src/pages/StaticNotesIndex.tsx", (s) => {
  if (s.includes("unfinished")) { console.log("index already done"); return s; }
  s = swap(s, 'import { IMED, isPublished } from "@/data/imed";', 'import { IMED, isPublished } from "@/data/imed";\nimport { unfinished } from "@/lib/noteProgress";');
  s = swap(s, "  const imedWritten = ", "  const resume = useMemo(() => unfinished(user?.id), [user?.id]);\n  const imedWritten = ");
  s = swap(s, '      <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Year">', `      {resume.length > 0 && (
        <section className="mt-5 rounded-2xl border border-primary/30 bg-primary/5 p-4" aria-label="Continue reading">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Continue where you stopped</p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">{resume.map((p) => <li key={p.slug}><Link to={\`/notes/\${p.slug}\`} className="flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-2 text-sm font-semibold hover:text-primary"><span className="min-w-0 truncate">{p.title}</span><span className="shrink-0 text-xs font-bold text-muted-foreground">{p.progress}%</span></Link></li>)}</ul>
        </section>
      )}

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Year">`);
  return s;
});
console.log("features applied");
