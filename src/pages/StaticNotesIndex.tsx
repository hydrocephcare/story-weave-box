import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, FolderOpen, Search } from "lucide-react";
import { STATIC_NOTES as ALL_NOTES, groupNotes, type StaticNote } from "@/data/staticNotes";
import { updateMetaTags } from "@/lib/seo";
import ContentCredit from "@/components/ContentCredit";
import { useMyYear } from "@/hooks/useMyYear";
import { useAuth } from "@/hooks/useAuth";
import { allReads } from "@/lib/readLog";
import { IMED, isPublished } from "@/data/imed";
import { unfinished } from "@/lib/noteProgress";
import { savedNotes } from "@/lib/savedNotes";
import { getUnitsForYear, unitPath, type Unit } from "@/lib/academic";

/** Past papers are not study notes: they are on /papers. */
const NOTES = ALL_NOTES.filter((n) => !n.paper);
const YEARS = [1, 2, 3, 4, 5, 6];
const isBank = (n: StaticNote) => /question bank/i.test(`${n.group ?? ""} ${n.title}`);

/** /notes: every note that ships with the site. Pick a year, then a unit (a folder), then a note. A tick marks notes you have read properly. */
export default function StaticNotesIndex() {
  const [params, setParams] = useSearchParams();
  const { year: myYear } = useMyYear();
  const { user } = useAuth();
  const fromUrl = Number(params.get("year")) || null;
  const [year, setYear] = useState<number>(fromUrl ?? myYear ?? 4);
  const [unit, setUnit] = useState<string | null>(params.get("unit"));
  const [q, setQ] = useState("");
  useEffect(() => { if (fromUrl) setYear(fromUrl); }, [fromUrl]);
  useEffect(() => { updateMetaTags({ title: "Medical Study Notes by Year and Unit | Ompath Study", description: "Study notes organised by year and unit: internal medicine by system, psychiatry, paediatrics, obstetrics and gynaecology, surgery and clinical pharmacology, each with a contents list and practice questions." }); }, []);

  // the year's course units (lectures, notes, MCQs, essays and past papers for each), from the course outline
  const [courseUnits, setCourseUnits] = useState<Unit[]>([]);
  useEffect(() => { let on = true; setCourseUnits([]); getUnitsForYear(year).then((u) => { if (on) setCourseUnits(u.filter((x) => x.published !== false)); }).catch(() => undefined); return () => { on = false; }; }, [year]);

  const read = useMemo(() => new Set(allReads(user?.id).map((r) => r.p)), [user?.id]);
  const done = (n: StaticNote) => read.has(`/notes/${n.slug}`);
  const needles = q.toLowerCase().split(/\s+/).filter(Boolean);
  const searching = needles.length > 0;
  const count = (y: number) => NOTES.filter((n) => n.year === y).length;

  const ofYear = useMemo(() => NOTES.filter((n) => n.year === year), [year]);
  const units = useMemo(() => groupNotes(ofYear), [ofYear]);
  const matches = useMemo(() => (searching ? NOTES.filter((n) => needles.every((w) => `${n.title} ${n.unit} ${n.group ?? ""} ${n.description}`.toLowerCase().includes(w))) : []), [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = unit ? units.filter((u) => u.unit === unit) : [];
  const pick = (u: string | null) => { setUnit(u); const p = new URLSearchParams(params); p.set("year", String(year)); if (u) p.set("unit", u); else p.delete("unit"); setParams(p, { replace: true }); };
  const switchYear = (y: number) => { setYear(y); setUnit(null); setQ(""); setParams({ year: String(y) }, { replace: true }); };

  const resume = useMemo(() => unfinished(user?.id), [user?.id]);
  const shelf = useMemo(() => savedNotes(user?.id).map((slug) => NOTES.find((n) => n.slug === slug)).filter((n): n is StaticNote => Boolean(n)).slice(0, 6), [user?.id]);
  const imedWritten = IMED.reduce((a, s) => a + s.topics.filter(isPublished).length, 0);
  const imedTotal = IMED.reduce((a, s) => a + s.topics.length, 0);

  const NoteRow = ({ n }: { n: StaticNote }) => (
    <li>
      <Link to={`/notes/${n.slug}`} className="group flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/60 hover:bg-primary/5">
        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${done(n) ? "bg-emerald-600 text-white" : "border border-border"}`} aria-label={done(n) ? "Read" : "Not read yet"}>{done(n) && <Check className="h-3.5 w-3.5" aria-hidden />}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-snug text-foreground group-hover:text-primary">{n.title}</span>
          <span className="mt-0.5 line-clamp-2 block text-[13px] leading-5 text-muted-foreground">{n.description}</span>
        </span>
        {isBank(n) && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Questions</span>}
      </Link>
    </li>
  );

  const courseGrid = courseUnits.length === 0 ? null : (
    <section aria-label={`Year ${year} course units`}>
      <h2 className="font-serif text-2xl font-bold">Year {year} course units</h2>
      <p className="mt-1 text-sm text-muted-foreground">Every unit of the year, with its lectures, notes, MCQs, essays and past papers on one page.</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {courseUnits.map((u) => (
          <li key={u.id}>
            <Link to={unitPath(year, u.slug)} className="flex h-full items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/60 hover:bg-primary/5">
              <span className="min-w-0 flex-1"><span className="block font-semibold leading-snug">{u.name}</span>{u.course_code && <span className="block text-xs text-muted-foreground">{u.course_code}</span>}</span>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-xs font-semibold text-muted-foreground"><Link to="/" className="hover:text-primary">Home</Link> › <span className="text-foreground">Notes</span></nav>
      <h1 className="mt-3 font-serif text-3xl font-bold text-foreground sm:text-4xl">Study notes</h1>
      <p className="mt-2 text-sm text-muted-foreground">{NOTES.length} notes, each with a contents list and practice questions. Past papers are on <Link to="/papers" className="font-bold text-primary hover:underline">their own page</Link>.</p>
      <ContentCredit />

      {resume.length > 0 && (
        <section className="mt-5 rounded-2xl border border-primary/30 bg-primary/5 p-4" aria-label="Continue reading">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Continue where you stopped</p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">{resume.map((p) => <li key={p.slug}><Link to={`/notes/${p.slug}`} className="flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-2 text-sm font-semibold hover:text-primary"><span className="min-w-0 truncate">{p.title}</span><span className="shrink-0 text-xs font-bold text-muted-foreground">{p.progress}%</span></Link></li>)}</ul>
        </section>
      )}

      {shelf.length > 0 && (
        <section className="mt-5 rounded-2xl border border-border bg-card p-4" aria-label="Saved for later">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Saved for later</p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">{shelf.map((n) => <li key={n.slug}><Link to={`/notes/${n.slug}`} className="block truncate rounded-lg bg-background px-3 py-2 text-sm font-semibold hover:text-primary">{n.title}</Link></li>)}</ul>
        </section>
      )}

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Year">
        {YEARS.map((y) => (
          <button key={y} type="button" role="tab" aria-selected={year === y} onClick={() => switchYear(y)} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition-colors ${year === y ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/60"}`}>
            Year {y}<span className={`ml-1.5 text-xs font-semibold ${year === y ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{count(y)}</span>
          </button>
        ))}
      </div>

      <div className="relative mt-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every note, e.g. asthma, malaria" aria-label="Search notes" className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary" />
      </div>

      {searching ? (
        <section className="mt-6" aria-label="Search results">
          <p className="text-sm text-muted-foreground">{matches.length} note{matches.length === 1 ? "" : "s"} found</p>
          {matches.length === 0 ? <p className="mt-3 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No notes match. Try a shorter search.</p> : (
            <ul className="mt-3 grid gap-2">{matches.map((n) => <NoteRow key={n.slug} n={n} />)}</ul>
          )}
        </section>
      ) : units.length === 0 ? (
        <div className="mt-6">{courseGrid}</div>
      ) : (
        <>
          <section className="mt-6" aria-label={`Year ${year} units`}>
            <div className="flex items-baseline justify-between"><h2 className="font-serif text-2xl font-bold">Year {year} units</h2>{unit && <button type="button" onClick={() => pick(null)} className="text-sm font-bold text-primary hover:underline">All units</button>}</div>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {units.map((u) => {
                const list = u.groups.flatMap((g) => g.notes);
                const d = list.filter(done).length;
                const on = unit === u.unit;
                return (
                  <li key={u.unit}>
                    <button type="button" onClick={() => pick(on ? null : u.unit)} aria-pressed={on} className={`flex h-full w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${on ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/60"}`}>
                      <FolderOpen className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block font-serif text-lg font-bold leading-tight">{u.unit}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{u.groups.length} section{u.groups.length === 1 ? "" : "s"} · {list.length} note{list.length === 1 ? "" : "s"}{d ? ` · ${d} read` : ""}</span>
                        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${list.length ? Math.round((d / list.length) * 100) : 0}%` }} /></span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {year === 4 && (
              <Link to="/imed" className="mt-3 flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4 hover:bg-primary/10">
                <span className="min-w-0 flex-1"><span className="block font-serif text-lg font-bold">Internal medicine, system by system</span><span className="block text-sm text-muted-foreground">{imedWritten} of {imedTotal} topics written, with ticks, links between topics and an exam roadmap.</span></span>
                <ArrowRight className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              </Link>
            )}
          </section>

          <div className="mt-8">{courseGrid}</div>

          {open.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">Choose a unit to see its notes.</p>
          ) : open.map((u) => (
            <section key={u.unit} className="mt-8" aria-label={u.unit}>
              <h2 className="font-serif text-2xl font-bold">{u.unit}</h2>
              {u.groups.map((g) => (
                <div key={g.group} className="mt-5">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{g.group} <span className="font-semibold text-muted-foreground">· {g.notes.length}</span></h3>
                  <ul className="mt-2 grid gap-2">{g.notes.map((n) => <NoteRow key={n.slug} n={n} />)}</ul>
                </div>
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
