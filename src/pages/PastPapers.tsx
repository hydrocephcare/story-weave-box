import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, CircleDashed, FileText, ScanLine } from "lucide-react";
import DriveFileViewer, { type DriveFile } from "@/components/DriveFileViewer";
import { startDownload } from "@/lib/driveDownload";
import { COURSE_OUTLINES } from "@/data/courseOutlines";
import { PAPER_NOTES, TRIMESTER_LABEL, trimesterOf, type PaperNote } from "@/data/staticNotes";
import { updateMetaTags } from "@/lib/seo";
import ContentCredit from "@/components/ContentCredit";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthOf = (p: PaperNote) => (p.paper.sat ? Number(p.paper.sat.split("-")[1]) : null);
const yearOf = (p: PaperNote) => (p.paper.sat ? Number(p.paper.sat.split("-")[0]) : null);
const counts = (p: PaperNote["paper"]) => [p.mcq ? `${p.mcq} MCQ` : "", p.saq ? `${p.saq} written` : ""].filter(Boolean).join(" · ");
/** Newest sitting first; undated papers last. */
const bySitting = (a: PaperNote, b: PaperNote) => (b.paper.sat ?? "").localeCompare(a.paper.sat ?? "");

const outlineName = (id: string) => COURSE_OUTLINES.find((o) => o.id === id)?.department ?? id;
/** Which outline each topic id belongs to, so a mixed paper counts towards every unit it touches. */
const OWNER = new Map<string, string>();
for (const o of COURSE_OUTLINES) for (const s of o.sections) for (const i of s.items) OWNER.set(i.id, o.id);
const papersTouching = (outlineId: string) => PAPER_NOTES.filter((p) => p.paper.topics.some((t) => OWNER.get(t) === outlineId));

function PaperCard({ p }: { p: PaperNote }) {
  const m = monthOf(p);
  return (
    <li>
      <Link to={`/notes/${p.slug}`} className="block rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-primary/50">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <span className="text-primary">{p.paper.satLabel}</span><span>·</span><span>{p.paper.code}</span><span>·</span><span>{p.paper.kind}</span>
          {!p.paper.complete && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">Pages missing</span>}
        </p>
        <h3 className="mt-1 text-[15px] font-bold leading-snug text-foreground">{p.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{counts(p.paper)}{m ? ` · ${MONTHS[m - 1]}` : ""}{p.paper.printed ? ` · printed as "${p.paper.printed}"` : ""}</p>
      </Link>
    </li>
  );
}

/** /papers: past papers by trimester, month and unit, and what each unit's papers have (and have not) asked from the course outline. */
/** The scanned PDFs the papers were typed up from, so a student can check any question against the original page. */
function ScanLibrary() {
  const scans = useMemo<DriveFile[]>(() => {
    const ids = new Map<string, string>();
    for (const p of PAPER_NOTES) if (p.paper.driveId && !ids.has(p.paper.driveId)) ids.set(p.paper.driveId, p.paper.source || "Scanned papers");
    return [...ids].map(([id, name]) => [id, name, "pdf"] as DriveFile);
  }, []);
  const [open, setOpen] = useState<number | null>(null);
  if (!scans.length) return null;
  return (
    <section className="mt-5 rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><ScanLine className="h-4 w-4 text-primary" /> Scanned papers (PDF)</p>
      <p className="mt-1 text-xs text-muted-foreground">The original scanned pages each paper was typed up from. Read them here, or download.</p>
      <ul className="mt-2 grid gap-1.5">
        {scans.map((s, i) => (
          <li key={s[0]}>
            <button type="button" onClick={() => setOpen(i)} className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm font-semibold text-foreground hover:border-primary/50 hover:text-primary"><FileText className="h-4 w-4 shrink-0 text-primary" /> <span className="min-w-0 flex-1 truncate">{s[1].replace(/\.pdf$/i, "")}</span><span className="shrink-0 text-xs font-bold text-primary">Read</span></button>
          </li>
        ))}
      </ul>
      <DriveFileViewer items={scans} index={open} onIndexChange={setOpen} onDownload={(f) => startDownload(f[0], f[1])} where="Past papers" />
    </section>
  );
}

export default function PastPapers() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "coverage" ? "coverage" : "papers";
  const now = trimesterOf(new Date());
  const trimParam = params.get("trim");
  const trim = trimParam === "all" || trimParam === null ? 0 : Number(trimParam);
  const unit = params.get("unit") ?? "";
  const month = Number(params.get("month")) || 0;
  const set = (patch: Record<string, string | null>) => { const next = new URLSearchParams(params); for (const [k, v] of Object.entries(patch)) { if (v === null || v === "") next.delete(k); else next.set(k, v); } setParams(next, { replace: true }); };

  useEffect(() => {
    updateMetaTags({
      title: "MKU MBChB Past Papers by Trimester with Answers | Ompath Study",
      description: `${PAPER_NOTES.length} Mount Kenya University MBChB past papers (CATs and end-of-year exams) sorted by trimester and month, each with answers, plus the topics each unit's papers have asked from the course outline.`,
    });
  }, []);

  const units = useMemo(() => [...new Set(PAPER_NOTES.map((p) => p.paper.outline))], []);
  const coverageUnits = useMemo(() => [...new Set(PAPER_NOTES.flatMap((p) => p.paper.topics.map((t) => OWNER.get(t)).filter((o): o is string => Boolean(o))))], []);
  const months = useMemo(() => [...new Set(PAPER_NOTES.map(monthOf).filter((m): m is number => m !== null))].sort((a, b) => a - b), []);
  const filtered = useMemo(() => PAPER_NOTES.filter((p) => (!trim || p.paper.trimester === trim) && (!unit || p.paper.outline === unit) && (!month || monthOf(p) === month)).sort(bySitting), [trim, unit, month]);
  const order = [now, ...[1, 2, 3].filter((t) => t !== now)];

  const chip = (active: boolean) => `rounded-full border px-3 py-1 text-xs font-bold transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-primary"}`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-xs font-semibold text-muted-foreground"><Link to="/" className="hover:text-primary">Home</Link> › <span className="text-foreground">Past papers</span></nav>
      <h1 className="mt-3 font-serif text-3xl font-bold text-foreground sm:text-4xl">Past papers</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        {PAPER_NOTES.length} Mount Kenya University papers, sorted by the trimester they were sat in (Trimester 1 is September to December, 2 is January to April, 3 is May to August). Every question has an answer written for revision, not copied from the scan. It is now <strong className="text-foreground">Trimester {now}</strong>.
      </p>

      <ContentCredit />
      <ScanLibrary />

      <div role="tablist" className="mt-5 flex gap-2">
        <button role="tab" aria-selected={view === "papers"} onClick={() => set({ view: null })} className={chip(view === "papers")}>Papers</button>
        <button role="tab" aria-selected={view === "coverage"} onClick={() => set({ view: "coverage" })} className={chip(view === "coverage")}>Topics asked and not yet asked</button>
      </div>

      {view === "papers" ? (
        <>
          <div className="mt-5 space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2"><span className="w-20 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Trimester</span>
              <button className={chip(!trim)} onClick={() => set({ trim: "all" })}>All</button>
              {[1, 2, 3].map((t) => <button key={t} className={chip(trim === t)} onClick={() => set({ trim: String(t) })}>{t}{t === now ? " (now)" : ""}</button>)}
            </div>
            <div className="flex flex-wrap items-center gap-2"><span className="w-20 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Month</span>
              <button className={chip(!month)} onClick={() => set({ month: null })}>Any</button>
              {months.map((m) => <button key={m} className={chip(month === m)} onClick={() => set({ month: String(m) })}>{MONTHS[m - 1].slice(0, 3)}</button>)}
            </div>
            {units.length > 1 && (
              <div className="flex flex-wrap items-center gap-2"><span className="w-20 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Unit</span>
                <button className={chip(!unit)} onClick={() => set({ unit: null })}>All</button>
                {units.map((u) => <button key={u} className={chip(unit === u)} onClick={() => set({ unit: u })}>{outlineName(u)}</button>)}
              </div>
            )}
          </div>

          {filtered.length === 0 && <p className="mt-6 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No papers match these filters yet. More are being added.</p>}
          {order.map((t) => {
            const inT = filtered.filter((p) => p.paper.trimester === t);
            if (!inT.length) return null;
            return (
              <section key={t} className="mt-8">
                <h2 className="font-serif text-xl font-bold text-foreground">{TRIMESTER_LABEL[t]}{t === now && <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 align-middle font-sans text-[10px] font-bold uppercase tracking-wider text-primary">Now</span>}</h2>
                {[...new Set(inT.map((p) => p.paper.outline))].map((o) => (
                  <div key={o} className="mt-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{outlineName(o)}</p>
                    <ul className="mt-1.5 grid gap-2 sm:grid-cols-2">{inT.filter((p) => p.paper.outline === o).map((p) => <PaperCard key={p.slug} p={p} />)}</ul>
                  </div>
                ))}
              </section>
            );
          })}
          {filtered.some((p) => p.paper.trimester === null) && (
            <section className="mt-8">
              <h2 className="font-serif text-xl font-bold text-foreground">Undated papers</h2>
              <p className="mt-1 text-xs text-muted-foreground">These papers carry no date. They are filed here until the sitting is confirmed.</p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">{filtered.filter((p) => p.paper.trimester === null).map((p) => <PaperCard key={p.slug} p={p} />)}</ul>
            </section>
          )}
        </>
      ) : (
        <Coverage unit={unit || coverageUnits[0]} units={coverageUnits} setUnit={(u) => set({ unit: u })} chip={chip} />
      )}
    </div>
  );
}

function Coverage({ unit, units, setUnit, chip }: { unit: string; units: string[]; setUnit: (u: string) => void; chip: (a: boolean) => string }) {
  const outline = COURSE_OUTLINES.find((o) => o.id === unit);
  const papers = papersTouching(unit).sort(bySitting);
  const asked = useMemo(() => {
    const map = new Map<string, PaperNote[]>();
    for (const p of papers) for (const id of p.paper.topics) map.set(id, [...(map.get(id) ?? []), p]);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit]);
  if (!outline) return null;
  const sections = outline.sections.map((s) => ({ ...s, items: s.items.filter((i) => !/\bCAT\b|assessment|revision|examination/i.test(i.title)) }));
  const all = sections.flatMap((s) => s.items);
  const hit = all.filter((i) => asked.has(i.id)).length;

  return (
    <div className="mt-5">
      {units.length > 1 && <div className="flex flex-wrap gap-2">{units.map((u) => <button key={u} className={chip(u === unit)} onClick={() => setUnit(u)}>{outlineName(u)}</button>)}</div>}
      <h2 className="mt-5 font-serif text-2xl font-bold text-foreground">{outline.department}: what the papers have asked</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        {papers.length} paper{papers.length === 1 ? "" : "s"} on the site cover <strong className="text-foreground">{hit} of {all.length}</strong> topics in the course outline. Read the topics that have never been asked as well, because the exam can come from anywhere in the outline.
      </p>
      <div className="mt-2 h-2 max-w-md overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((hit / Math.max(1, all.length)) * 100)}%` }} /></div>

      {sections.map((s) => (
        <section key={s.id} className="mt-6">
          <h3 className="text-[13px] font-bold text-foreground">{s.title}</h3>
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-card">
            {s.items.map((i) => {
              const list = asked.get(i.id) ?? [];
              return (
                <li key={i.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3.5 py-2.5">
                  {list.length ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Asked" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Not asked yet" />}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold ${list.length ? "text-foreground" : "text-muted-foreground"}`}>{i.title}{i.week ? <span className="ml-2 text-[11px] font-medium text-muted-foreground">{i.week}</span> : null}</p>
                    {list.length > 0 ? (
                      <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px]">{list.map((p) => <Link key={p.slug} to={`/notes/${p.slug}`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"><FileText className="h-3 w-3" />{p.paper.satLabel}</Link>)}</p>
                    ) : <p className="mt-0.5 text-[11px] text-muted-foreground">Not asked in the papers on the site yet. Study it anyway.</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
