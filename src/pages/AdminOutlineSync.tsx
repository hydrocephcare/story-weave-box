import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, Loader2, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { STATIC_NOTES } from "@/data/staticNotes";
import { loadOutlineDocs, matchOutline, saveOutlineDocs, semesterLabel, useOutlineDocs, type OutlineDoc, type OutlineRow } from "@/lib/outlineSync";

const field = "h-11 w-full rounded-lg border border-border bg-background px-3 text-[15px] outline-none focus:border-primary";

/** Admin: add a course outline. Paste it (or open a text file), the AI reads it, check the rows, save. Every matching page then shows where it sits in the course. */
export default function AdminOutlineSync() {
  const docs = useOutlineDocs();
  const [year, setYear] = useState(4);
  const [semester, setSemester] = useState("2");
  const [unit, setUnit] = useState("");
  const [startDate, setStartDate] = useState("");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<OutlineRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { void loadOutlineDocs(true); }, []);

  const read = async () => {
    setBusy(true); setMsg("");
    try {
      const { data } = await supabase.auth.getSession();
      const r = await fetch("/api/outline-parse", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` }, body: JSON.stringify({ text, year, semester, unit }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Could not read it (${r.status}).`);
      setRows((j.items as Omit<OutlineRow, "id">[]).map((x, i) => ({ id: `r${Date.now()}${i}`, week: x.week ?? "", topic: x.topic, lecturer: x.lecturer ?? "", detail: x.detail ?? "" })));
      setMsg(`${j.items.length} rows read. Check them, then save.`);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const save = async () => {
    if (!rows.length) return;
    setBusy(true);
    try {
      const id = `y${year}-s${semester}-${unit.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "all"}`;
      const doc: OutlineDoc = { id, year, semester, unit: unit.trim(), startDate, rows: rows.filter((r) => r.topic.trim()) };
      await saveOutlineDocs([...docs.filter((d) => d.id !== id), doc]);
      setRows([]); setText(""); setMsg("Saved. Every matching note, blog and topic now shows where it sits in the course.");
    } catch (e) { setMsg((e as Error).message || "Could not save."); } finally { setBusy(false); }
  };

  const unmatched = useMemo(() => (docs.length ? STATIC_NOTES.filter((n) => !n.paper && !matchOutline(docs, { title: n.title, year: n.year, unit: n.unit })).slice(0, 40) : []), [docs]);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Admin</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Course outline sync</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">Paste a course outline. Ompath AI reads the weeks, topics and lecturers. Once saved, every note, blog and topic that matches a row says where it sits: year, semester, week, unit and lecturer.</p>

      <section className="mt-8 space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="text-sm font-semibold">Year<select className={field} value={year} onChange={(e) => setYear(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>Year {y}</option>)}</select></label>
          <label className="text-sm font-semibold">Semester<select className={field} value={semester} onChange={(e) => setSemester(e.target.value)}>{["1", "2", "3"].map((s) => <option key={s} value={s}>Semester {s}</option>)}</select></label>
          <label className="col-span-2 text-sm font-semibold">Unit<input className={field} placeholder="e.g. Internal Medicine" value={unit} onChange={(e) => setUnit(e.target.value)} /></label>
        </div>
        <label className="block text-sm font-semibold">First day of week 1 (optional, lets the site show what is taught this week)<input type="date" className={field} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label className="block text-sm font-semibold">Outline text
          <textarea className="mt-1 min-h-[220px] w-full rounded-lg border border-border bg-background p-3 text-[15px] outline-none focus:border-primary" placeholder="Paste the outline here: weeks, topics, lecturers…" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".txt,.md,.csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} className="text-sm" />
          <button type="button" disabled={busy || text.trim().length < 40} onClick={read} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-[15px] font-bold text-primary-foreground disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Read with AI</button>
        </div>
        {msg && <p className="text-sm font-semibold text-primary" role="status">{msg}</p>}
      </section>

      {rows.length > 0 && (
        <section className="mt-8">
          <h2 className="font-serif text-2xl font-bold">Check the rows</h2>
          <ul className="mt-4 space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <input className={`${field} w-24`} value={r.week} aria-label="Week" onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, week: e.target.value } : x)))} />
                <input className={`${field} min-w-0 flex-1`} value={r.topic} aria-label="Topic" onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, topic: e.target.value } : x)))} />
                <input className={`${field} w-40`} value={r.lecturer} placeholder="Lecturer" aria-label="Lecturer" onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, lecturer: e.target.value } : x)))} />
                <button type="button" aria-label="Remove row" onClick={() => setRows(rows.filter((x) => x.id !== r.id))} className="p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
          <button type="button" disabled={busy} onClick={save} className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-primary px-7 text-base font-bold text-primary-foreground">Save to the site</button>
        </section>
      )}

      <section className="mt-12">
        <h2 className="font-serif text-2xl font-bold">Saved outlines</h2>
        {docs.length === 0 ? <p className="mt-3 text-muted-foreground">None yet.</p> : (
          <ul className="mt-3 space-y-2">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3"><CalendarCheck className="h-4 w-4 text-primary" aria-hidden /><span className="min-w-0 flex-1 font-semibold">Year {d.year} · {semesterLabel(d.semester)}{d.unit ? ` · ${d.unit}` : ""} <span className="font-normal text-muted-foreground">({d.rows.length} rows)</span></span>
                <button type="button" onClick={async () => { if (window.confirm("Remove this outline?")) await saveOutlineDocs(docs.filter((x) => x.id !== d.id)); }} className="text-sm font-bold text-muted-foreground hover:text-destructive">Remove</button></li>
            ))}
          </ul>
        )}
      </section>

      {unmatched.length > 0 && (
        <section className="mt-12">
          <h2 className="font-serif text-2xl font-bold">Notes that match no outline row</h2>
          <p className="mt-1 text-sm text-muted-foreground">Add a row with the same words, or reword the note's title.</p>
          <ul className="mt-3 space-y-1.5">{unmatched.map((n) => <li key={n.slug}><Link to={`/notes/${n.slug}`} className="text-[15px] font-semibold hover:text-primary">{n.title}</Link> <span className="text-xs text-muted-foreground">Year {n.year} · {n.unit}</span></li>)}</ul>
        </section>
      )}
    </main>
  );
}
