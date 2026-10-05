import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { BadgeCheck, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, FolderOpen, Hospital, ZoomIn } from "lucide-react";
import registry from "@/data/libraries.json";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import ShareButton from "@/components/ShareButton";
import { timetableMeta } from "@/lib/libraryMeta";
import { updateMetaTags, SITE_URL } from "@/lib/seo";
import { YEAR_TEACHING_STAFF } from "@/lib/timetable2026";
import { useTimetable } from "@/lib/siteConfig";
import { PAPER_NOTES, TRIMESTER_LABEL, trimesterOf } from "@/data/staticNotes";

const pageUrl = (n: number) => `${import.meta.env.BASE_URL}timetable/p-${String(n).padStart(2, "0")}.jpg`;

/** /timetable/year-1 … /timetable/year-6 — the official Sept–Dec 2026 timetable, one shareable page per year. */
export default function YearTimetable() {
  const { year } = useParams();
  const tt = registry.timetables.years.find((y) => y.slug === year);
  const [zoom, setZoom] = useState<number | null>(null);
  const schedules = useTimetable(tt?.year ?? 1);
  const meta = useMemo(() => (tt ? timetableMeta(registry, tt) : null), [tt]);
  const nowTrimester = trimesterOf(new Date());
  const yearPapers = useMemo(() => PAPER_NOTES.filter((p) => p.year === tt?.year && p.paper.trimester === nowTrimester).sort((a, b) => (b.paper.sat ?? "").localeCompare(a.paper.sat ?? "")), [tt, nowTrimester]);

  useEffect(() => {
    if (!meta) return;
    updateMetaTags({ title: meta.title, description: meta.description, image: `${SITE_URL}${meta.ogImage}`, url: `${SITE_URL}${meta.path}`, type: "website", keywords: meta.keywords });
    window.scrollTo({ top: 0 });
  }, [meta]);

  if (!tt || !meta) return <Navigate to="/timetable/year-1" replace />;
  const t = registry.timetables;
  const staff = YEAR_TEACHING_STAFF[tt.year] ?? [];
  const hasLibrary = registry.libraries.some((l) => l.year === tt.year);

  return (
    <div className="min-h-dvh bg-muted/20">
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary"><CalendarDays className="h-4 w-4" /> {t.term} · {t.period}</p>
              <h1 className="mt-2 font-serif text-3xl font-bold text-foreground sm:text-4xl">{meta.h1}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{tt.intake} · Mount Kenya University, School of Medicine</p>
            </div>
            <ShareButton url={`${SITE_URL}${meta.path}`} title={meta.title} text={meta.shareText} />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {t.dates.map((d) => (
              <div key={d.label} className="rounded-2xl border border-border bg-card px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">{d.label}</p>
                <p className="mt-0.5 font-serif text-lg font-bold text-foreground">{d.value}</p>
              </div>
            ))}
          </div>

          <nav aria-label="Choose a year" className="mt-6 flex flex-wrap gap-2">
            {t.years.map((y) => (
              <Link key={y.slug} to={`/timetable/${y.slug}`} aria-current={y.slug === tt.slug ? "page" : undefined} className={`rounded-full border px-4 py-1.5 text-sm font-bold transition-colors ${y.slug === tt.slug ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/50"}`}>Year {y.year}</Link>
            ))}
          </nav>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-8 px-5 py-8">
        <section aria-labelledby="official-pages">
          <h2 id="official-pages" className="font-serif text-xl font-bold text-foreground">The official timetable</h2>
          <p className="mt-1 text-sm text-muted-foreground">Tap a page to enlarge it. {tt.year >= 4 ? "Clinical years rotate in groups — find your group and rotation in the grids." : "Find your group (A, B or C) in each grid."}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {tt.pages.map((p, i) => (
              <button key={p} type="button" onClick={() => setZoom(i)} className="group relative overflow-hidden rounded-xl border border-border bg-card text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[var(--shadow-elevated)]" aria-label={`Open page ${i + 1} of ${tt.pages.length}`}>
                <img src={pageUrl(p)} alt={`Year ${tt.year} timetable, page ${i + 1} of ${tt.pages.length}`} loading={i < 4 ? "eager" : "lazy"} decoding="async" className="aspect-[22/17] w-full bg-white object-cover object-top" />
                <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100"><ZoomIn className="h-3 w-3" /> Enlarge</span>
                <span className="block px-3 py-2 text-[11px] font-semibold text-muted-foreground">Page {i + 1} of {tt.pages.length}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">Source: {t.source}. Lecturers’ personal phone numbers are left out. Timetables can change, so confirm with your department or the notice board.</p>
        </section>

        {yearPapers.length > 0 && (
          <section aria-labelledby="papers-for-trimester" className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <h2 id="papers-for-trimester" className="font-serif text-xl font-bold text-foreground">Past papers for this trimester</h2>
            <p className="mt-1 text-sm text-muted-foreground">{TRIMESTER_LABEL[nowTrimester]}. {yearPapers.length} Year {tt.year} past paper{yearPapers.length === 1 ? "" : "s"} from this part of the year, with answers, so you can practise what this trimester's units have asked.</p>
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {yearPapers.map((p) => <li key={p.slug}><Link to={`/notes/${p.slug}`} className="block rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:border-primary/50 hover:text-primary">{p.title}<span className="block text-[11px] font-medium text-muted-foreground">{p.paper.satLabel} · {p.unit}</span></Link></li>)}
            </ul>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold"><Link to={`/papers?trim=${nowTrimester}`} className="text-primary hover:underline">All trimester {nowTrimester} papers</Link><Link to="/papers?view=coverage" className="text-primary hover:underline">Topics asked and not yet asked</Link></p>
          </section>
        )}

        {schedules.length > 0 && (
          <section aria-labelledby="text-timetable">
            <h2 id="text-timetable" className="font-serif text-xl font-bold text-foreground">Text version</h2>
            <p className="mt-1 text-sm text-muted-foreground">Easy to read on a phone and to search. Entries follow the order of the official grid.</p>
            {tt.year === 4 && <p className="mt-2 flex items-center gap-2 rounded-xl bg-primary/5 p-3 text-xs text-muted-foreground"><Hospital className="h-4 w-4 shrink-0 text-primary" /> Year 4 clinical rotations take place at Thika Level 5 Hospital.</p>}
            <div className="mt-4 space-y-3">
              {schedules.map((table) => (
                <details key={table.label} className="overflow-hidden rounded-2xl border border-border bg-card" open={schedules.length === 1}>
                  <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-foreground">{table.label}</summary>
                  <div className="overflow-x-auto border-t border-border">
                    <table className="w-full min-w-[640px] border-collapse text-xs">
                      <thead><tr className="bg-muted/50 text-left"><th className="p-2">Day</th><th className="p-2">Group</th><th className="p-2">Sessions (in time order)</th></tr></thead>
                      <tbody>
                        {table.rows.map((row, i) => (
                          <tr key={`${row.day}-${row.group ?? ""}-${i}`} className="border-t border-border align-top">
                            <td className="whitespace-nowrap p-2 font-bold">{row.day}</td>
                            <td className="p-2 font-bold text-primary">{row.group || "All"}</td>
                            <td className="p-2"><div className="flex flex-wrap gap-1.5">{row.entries.map((e, k) => <span key={`${e}-${k}`} className="rounded-md border border-border bg-background px-2 py-1 font-medium">{e}</span>)}</div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          </section>
        )}

        {staff.length > 0 && (
          <section aria-labelledby="teaching-staff">
            <h2 id="teaching-staff" className="font-serif text-xl font-bold text-foreground">Teaching staff this trimester</h2>
            <div className="mt-3 flex flex-wrap gap-2">{staff.map((n) => <span key={n} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium">{n}</span>)}</div>
          </section>
        )}

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {hasLibrary && (
            <Link to={`/library/year-${tt.year}`} className="group flex items-center gap-3 rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10">
              <FolderOpen className="h-6 w-6 text-primary" />
              <span><span className="block font-serif text-lg font-bold text-foreground">Year {tt.year} notes &amp; past papers</span><span className="block text-xs text-muted-foreground">Slides, textbooks and past papers, sorted by subject</span></span>
            </Link>
          )}
          {tt.year <= 4 && (
            <Link to={`/course-outlines/year-${tt.year}`} className="group flex items-center gap-3 rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10">
              <ExternalLink className="h-6 w-6 text-primary" />
              <span><span className="block font-serif text-lg font-bold text-foreground">Course outlines &amp; tracker</span><span className="block text-xs text-muted-foreground">Tick off topics as you revise</span></span>
            </Link>
          )}
        </section>

        <p className="flex items-center justify-center gap-1.5 pb-4 text-center text-xs font-bold text-primary"><BadgeCheck className="h-3.5 w-3.5" /> {registry.credit} · {registry.brand}</p>
      </div>

      <Dialog open={zoom !== null} onOpenChange={(o) => { if (!o) setZoom(null); }}>
        <DialogContent className="flex max-h-[94dvh] w-[96vw] max-w-6xl flex-col gap-2 overflow-hidden p-3 sm:p-4">
          <DialogTitle className="pr-8 text-sm font-bold">Year {tt.year} timetable — page {(zoom ?? 0) + 1} of {tt.pages.length}</DialogTitle>
          <DialogDescription className="sr-only">Enlarged page of the official timetable</DialogDescription>
          {zoom !== null && (
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-white">
              <img src={pageUrl(tt.pages[zoom])} alt={`Year ${tt.year} timetable page ${zoom + 1}`} className="mx-auto h-auto w-full max-w-[1320px]" />
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <button type="button" disabled={zoom === null || zoom <= 0} onClick={() => setZoom((z) => (z === null ? z : z - 1))} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-bold disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Previous</button>
            {zoom !== null && <a href={pageUrl(tt.pages[zoom])} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-primary hover:underline">Open full size</a>}
            <button type="button" disabled={zoom === null || zoom >= tt.pages.length - 1} onClick={() => setZoom((z) => (z === null ? z : z + 1))} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-bold disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
