import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowRight, Check, Eye, EyeOff, FileText, Printer, RotateCcw, Search, Stethoscope } from "lucide-react";
import { ALL_CASES } from "@/clinical";
import { MUST_KNOWS, unitById, type MkUnit } from "@/data/mustKnows";
import { IMED_DISEASE_THEORY } from "@/data/imedDiseaseTheory";
import { hashId, resetKnown, setKnown, toggleKnown, useKnown } from "@/lib/mustKnowStore";
import { updateMetaTags } from "@/lib/seo";

interface Item { id: string; text: string; q?: string; caseId?: string }
interface Sec { title: string; items: Item[]; fromCase?: boolean }

/** Curated sections plus the must-knows of every simulator case in the matching rotation. */
function buildUnit(u: MkUnit): Sec[] {
  const curated: Sec[] = u.sections.map((s) => ({ title: s.title, items: s.items.map((m) => { const [text, q] = typeof m === "string" ? [m, undefined] : m; return { id: `${u.id}:${hashId(text)}`, text, q }; }) }));
  const cases = u.rotation ? ALL_CASES.filter((c) => c.rotation === u.rotation) : [];
  const fromCases: Sec[] = cases.map((c) => ({ title: c.title, fromCase: true, items: c.mustKnow.map((text) => ({ id: `${u.id}:${hashId(text)}`, text, q: c.revise, caseId: c.id })) }));
  return [...curated, ...fromCases];
}
const count = (secs: Sec[]) => secs.reduce((n, s) => n + s.items.length, 0);

// ------------------------------------------------------------------ hub
function Hub() {
  const known = useKnown();
  const rows = useMemo(() => MUST_KNOWS.map((u) => { const secs = buildUnit(u); const ids = secs.flatMap((s) => s.items.map((i) => i.id)); return { u, total: new Set(ids).size, done: new Set(ids.filter((i) => known[i])).size }; }), [known]);
  const total = rows.reduce((s, r) => s + r.total, 0); const done = rows.reduce((s, r) => s + r.done, 0);
  return (
    <div className="min-h-dvh bg-muted/20">
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="mx-auto max-w-4xl px-4 py-7 sm:px-5 sm:py-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Year 4 · this semester</p>
          <h1 className="mt-1 font-serif text-2xl font-bold leading-tight text-foreground sm:text-4xl">Must-knows for every unit</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">The facts a consultant expects you to say without thinking, for all seven units. Tick what you know, hide the text to test yourself, and print a unit as a one-page revision sheet.</p>
          <div className="mt-4 max-w-md"><div className="flex justify-between text-xs font-bold"><span>Overall</span><span>{done} / {total}</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div></div>
        </div>
      </section>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map(({ u, total: t, done: d }) => (
            <li key={u.id}>
              <Link to={`/must-knows/${u.id}`} className="group flex h-full min-w-0 flex-col rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[var(--shadow-elevated)]">
                <span className="text-2xl" aria-hidden="true">{u.emoji}</span>
                <span className="mt-1 font-serif text-lg font-bold text-foreground">{u.name}</span>
                <span className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{u.blurb}</span>
                <span className="mt-3 flex items-center justify-between text-[11px] font-bold"><span className={d === t && t > 0 ? "text-emerald-700" : "text-muted-foreground"}>{d} of {t} known</span><ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-0.5" /></span>
                <span className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${t ? (d / t) * 100 : 0}%` }} /></span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-muted-foreground">Looking for drugs? <Link to="/pharmacology" className="font-bold text-primary hover:underline">Open Pharmacology</Link>. Want to practise it on patients? <Link to="/clinical" className="font-bold text-primary hover:underline">Clinical simulator</Link>.</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ one unit
function Unit({ unit }: { unit: MkUnit }) {
  const known = useKnown();
  const secs = useMemo(() => buildUnit(unit), [unit]);
  const [filter, setFilter] = useState<"all" | "todo" | "done">("all");
  const [q, setQ] = useState("");
  const [recall, setRecall] = useState(false);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const ids = useMemo(() => Array.from(new Set(secs.flatMap((s) => s.items.map((i) => i.id)))), [secs]);
  const done = ids.filter((i) => known[i]).length;
  useEffect(() => { updateMetaTags({ title: `${unit.name} must-knows | Year 4 | Ompath Study`, description: unit.blurb }); window.scrollTo({ top: 0 }); }, [unit]);
  const visible = (i: Item) => (filter === "all" || (filter === "done") === Boolean(known[i.id])) && (!q || i.text.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="min-h-dvh bg-muted/20">
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-5 sm:py-9">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary"><Link to="/must-knows" className="hover:underline">Must-knows</Link> › Year 4</p>
          <h1 className="mt-1 font-serif text-2xl font-bold leading-tight text-foreground sm:text-3xl"><span aria-hidden="true">{unit.emoji}</span> {unit.name}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{unit.blurb}</p>
          <div className="mt-3 max-w-sm"><div className="flex justify-between text-xs font-bold"><span>{done} of {ids.length} known</span><span>{ids.length ? Math.round((done / ids.length) * 100) : 0}%</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${ids.length ? (done / ids.length) * 100 : 0}%` }} /></div></div>
          <div className="no-print mt-4 flex flex-wrap gap-2">
            {unit.id === "clinical-pharmacology" && <Link to="/pharmacology" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">Open the drug library <ArrowRight className="h-3.5 w-3.5" /></Link>}
            {unit.rotation && <Link to={`/clinical?rot=${unit.rotation}`} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-bold hover:border-primary/50"><Stethoscope className="h-3.5 w-3.5 text-primary" /> Practise on cases</Link>}
            <Link to="/course-outlines/year-4" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-bold hover:border-primary/50"><FileText className="h-3.5 w-3.5 text-primary" /> Course outline</Link>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-bold hover:border-primary/50"><Printer className="h-3.5 w-3.5 text-primary" /> Print</button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-5 sm:px-5">
        <div className="no-print flex flex-wrap items-center gap-2">
          <div className="relative min-w-[10rem] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a must-know…" aria-label="Find a must-know" className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" /></div>
          <div className="flex gap-1" role="group" aria-label="Show">{(["all", "todo", "done"] as const).map((f) => <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>{f === "all" ? "All" : f === "todo" ? "To learn" : "Known"}</button>)}</div>
          <button type="button" onClick={() => { setRecall((r) => !r); setShown({}); }} aria-pressed={recall} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${recall ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>{recall ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} Recall mode</button>
        </div>
        {recall && <p className="no-print rounded-xl bg-primary/5 px-3 py-2 text-xs text-foreground">Recall mode hides each must-know. Say it out loud, tap to check, then tick it if you were right.</p>}

        {secs.map((s) => {
          const list = s.items.filter(visible);
          if (!list.length) return null;
          const sid = s.items.map((i) => i.id);
          const allDone = sid.every((i) => known[i]);
          return (
            <section key={s.title} className="break-inside-avoid">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h2 className="min-w-0 font-serif text-base font-bold text-foreground">{s.fromCase ? <span className="mr-1.5 rounded-full bg-primary/10 px-2 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wider text-primary">Case</span> : null}{s.title}</h2>
                <button type="button" onClick={() => setKnown(sid, !allDone)} className="no-print shrink-0 text-[11px] font-bold text-primary hover:underline">{allDone ? "Untick all" : "Tick all"}</button>
              </div>
              <ul className="space-y-1.5">
                {list.map((it) => {
                  const on = Boolean(known[it.id]); const hidden = recall && !shown[it.id] && !on;
                  return (
                    <li key={it.id} className={`flex items-start gap-3 rounded-xl border p-3 ${on ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-card"}`}>
                      <button type="button" onClick={() => toggleKnown(it.id)} aria-pressed={on} aria-label={on ? "Mark as not known" : "Mark as known"} className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${on ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/40"}`}>{on && <Check className="h-3.5 w-3.5" />}</button>
                      <div className="min-w-0 flex-1">
                        {hidden ? <button type="button" onClick={() => setShown((x) => ({ ...x, [it.id]: true }))} className="w-full rounded-lg bg-muted/60 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Tap to reveal — say it first</button> : <p className="text-sm leading-relaxed text-foreground">{it.text}</p>}
                        {!hidden && (it.q || it.caseId) && (
                          <p className="no-print mt-1 flex flex-wrap gap-x-3 text-[11px] font-bold">
                            {it.q && <Link to={`/search?q=${encodeURIComponent(it.q)}`} className="text-primary hover:underline">Open the notes</Link>}
                            {it.caseId && <Link to={`/clinical/case/${it.caseId}?mode=full`} className="text-primary hover:underline">Practise this case</Link>}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {unit.rotation === "medicine" && filter === "all" && !q && (
          <section className="space-y-2">
            <div className="mb-2">
              <h2 className="font-serif text-lg font-bold text-foreground">Disease theory · condition by condition</h2>
              <p className="text-xs text-muted-foreground">Definition → causes → pathophysiology → clinical features → investigations → management → complications → viva pearl.</p>
            </div>
            {IMED_DISEASE_THEORY.map((d) => (
              <details key={d.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <summary className="cursor-pointer list-none px-4 py-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">{d.system}</span>
                  <span className="block font-serif text-base font-bold text-foreground">{d.name}</span>
                </summary>
                <div className="space-y-3 border-t border-border bg-muted/20 px-4 py-4 text-xs leading-relaxed text-foreground">
                  <p><b>Definition:</b> {d.definition}</p>
                  <div><b>Causes / risk factors</b><ul className="mt-1 list-disc space-y-1 pl-5">{d.causes.map((x) => <li key={x}>{x}</li>)}</ul></div>
                  <p><b>Pathophysiology:</b> {d.mechanism}</p>
                  <div><b>Clinical features</b><ul className="mt-1 list-disc space-y-1 pl-5">{d.presentation.map((x) => <li key={x}>{x}</li>)}</ul></div>
                  <div><b>Investigations</b><ul className="mt-1 list-disc space-y-1 pl-5">{d.investigations.map((x) => <li key={x}>{x}</li>)}</ul></div>
                  <div><b>Management principles</b><ul className="mt-1 list-disc space-y-1 pl-5">{d.management.map((x) => <li key={x}>{x}</li>)}</ul></div>
                  <div><b>Complications</b><ul className="mt-1 list-disc space-y-1 pl-5">{d.complications.map((x) => <li key={x}>{x}</li>)}</ul></div>
                  <p className="rounded-lg border border-primary/20 bg-primary/5 p-2.5"><b className="text-primary">Viva pearl:</b> {d.viva}</p>
                </div>
              </details>
            ))}
          </section>
        )}

        {secs.every((s) => s.items.filter(visible).length === 0) && <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{filter === "done" ? "Nothing ticked yet." : filter === "todo" ? "Everything here is ticked — well done!" : "Nothing matches that search."}</p>}
        <div className="no-print flex flex-wrap items-center justify-between gap-2 pt-2">
          <button type="button" onClick={() => { if (window.confirm(`Clear all ticks for ${unit.name}?`)) resetKnown(`${unit.id}:`); }} className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"><RotateCcw className="h-3 w-3" /> Clear ticks for this unit</button>
          <Link to="/must-knows" className="text-xs font-bold text-primary hover:underline">All units →</Link>
        </div>
      </div>
    </div>
  );
}

export default function MustKnows() {
  const { unit } = useParams();
  useEffect(() => { if (!unit) updateMetaTags({ title: "Must-knows for every Year 4 unit | Ompath Study", description: "The facts a consultant expects you to say without thinking: Internal Medicine, Surgery, Obstetrics & Gynaecology, Paediatrics, Psychiatry, Clinical Pharmacology and Radiology." }); }, [unit]);
  if (!unit) return <Hub />;
  const u = unitById(unit);
  if (!u) return <Navigate to="/must-knows" replace />;
  return <Unit key={u.id} unit={u} />;
}
