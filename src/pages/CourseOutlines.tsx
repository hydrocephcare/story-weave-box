import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { BadgeCheck, BookOpen, CheckCheck, ChevronDown, Download, Eye, FileText, FolderOpen, Flag, Lock, Printer, RotateCcw, Search, Target } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOutlineProgress } from "@/hooks/useOutlineProgress";
import { COURSE_OUTLINES, type CourseOutline, type OutlineSection } from "@/data/courseOutlines";
import DriveFileViewer, { type DriveFile } from "@/components/DriveFileViewer";
import { startDownload } from "@/lib/driveDownload";
import { updateMetaTags, SITE_URL } from "@/lib/seo";
import registry from "@/data/libraries.json";
import { outlineMeta } from "@/lib/libraryMeta";
import ShareButton from "@/components/ShareButton";
import { findOutline, libraryFileNames, loadYearOutlines, OUTLINE_YEARS } from "@/lib/outlineEngine";
import { toggleFlag, useTopicFlags } from "@/lib/topicFlags";
import { Skeleton } from "@/components/ui/skeleton";
import ConnectedLearning from "@/components/ConnectedLearning";
import { ROTATIONS } from "@/clinical/types";
import { Link2 } from "lucide-react";
import ContentCredit from "@/components/ContentCredit";

// Turn an outline title into a library search: first clause, no roman numerals/brackets, first three real words.
const STOP = new Set(["and","the","of","in","for","to","a","an","i","ii","iii","iv","vs","thread","introduction","overview","principles","disorders","drugs","agents","used"]);
const queryWords = (title: string) =>
  title.split(/ — | – |:/)[0].replace(/\([^)]*\)/g, " ").split(/[^A-Za-z0-9-]+/).filter((w) => w.length > 2 && !STOP.has(w.toLowerCase()));

/** Best library search for a topic that actually has files: two words first, then the most specific single word. */
function findNotes(title: string, names: string[]): { q: string; n: number } | null {
  if (/^(CAT|Weeks?)(\s|$)/.test(title) || names.length === 0) return null;
  const words = queryWords(title);
  const tries = [words.slice(0, 2).join(" "), ...words.slice(0, 2).sort((a, b) => b.length - a.length)].filter(Boolean);
  for (const q of tries) {
    const parts = q.toLowerCase().split(" ");
    const n = names.reduce((k, nm) => (parts.every((p) => nm.includes(p)) ? k + 1 : k), 0);
    if (n > 0) return { q, n };
  }
  return null;
}

const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);
const countItems = (o: CourseOutline) => o.sections.reduce((n, s) => n + s.items.length, 0);

function Bar({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-muted ${className}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${value}%` }} />
    </div>
  );
}

function YearTabs({ year }: { year: number }) {
  return (
    <nav aria-label="Choose a year" className="mt-5 flex flex-wrap gap-2">
      {OUTLINE_YEARS.map((y) => (
        <Link key={y} to={`/course-outlines/year-${y}`} aria-current={y === year ? "page" : undefined} className={`rounded-full border px-4 py-1.5 text-sm font-bold transition-colors ${y === year ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/50"}`}>Year {y}</Link>
      ))}
    </nav>
  );
}

/** /course-outlines (year overview) and /course-outlines/<unit> (one tracker). */
export default function CourseOutlinesRoute() {
  const { dept } = useParams();
  const [params] = useSearchParams();
  const legacy = params.get("d");
  if (!dept && legacy && COURSE_OUTLINES.some((o) => o.id === legacy)) return <Navigate to={`/course-outlines/${legacy}`} replace />;
  const yearMatch = dept?.match(/^year-([1-6])$/);
  if (!dept || yearMatch) {
    let saved = 0;
    try { saved = Number(localStorage.getItem("ompath_my_year")); } catch { /* storage blocked */ }
    const year = yearMatch ? Number(yearMatch[1]) : saved >= 1 && saved <= 4 ? saved : 4;
    return <OutlineIndex year={year} />;
  }
  return <OutlineLoader id={dept} />;
}

function OutlineIndex({ year }: { year: number }) {
  const { user } = useAuth();
  const { done } = useOutlineProgress(user?.id ?? null);
  const [list, setList] = useState<CourseOutline[] | null>(null);

  useEffect(() => {
    let on = true; setList(null);
    loadYearOutlines(year).then((l) => { if (on) setList(l); });
    return () => { on = false; };
  }, [year]);

  useEffect(() => {
    updateMetaTags({
      title: `Year ${year} Course Outlines & Study Checklists | ${registry.brand}`,
      description: `Year ${year} MBChB course outlines and study checklists with a tick-off tracker, linked to the notes in the library. ${(registry.seoCredit ?? registry.credit)}.`,
      image: `${SITE_URL}/og/library/outline-all.jpg`, url: `${SITE_URL}/course-outlines/year-${year}`, type: "website",
    });
    window.scrollTo({ top: 0 });
  }, [year]);

  const curated = (list ?? []).filter((o) => !o.auto);
  const autos = (list ?? []).filter((o) => o.auto);
  const Card = ({ o }: { o: CourseOutline }) => {
    const total = countItems(o);
    const d = o.sections.reduce((n, s) => n + s.items.filter((i) => done.has(i.id)).length, 0);
    return (
      <Link to={`/course-outlines/${o.id}`} className="group block rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[var(--shadow-elevated)]">
        <p className="font-serif text-lg font-bold leading-snug text-foreground">{o.department}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{total} {o.auto ? "files to tick off" : "topics"} · {o.sections.length} {o.sections.length === 1 ? "section" : "sections"}</p>
        <div className="mt-3 flex items-center gap-2"><Bar value={user ? pct(d, total) : 0} className="flex-1" /><span className="text-[11px] font-bold text-primary">{user ? `${pct(d, total)}%` : ""}</span></div>
      </Link>
    );
  };

  return (
    <div className="min-h-dvh bg-muted/20">
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="mx-auto max-w-4xl px-5 py-10 sm:py-14">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Year {year} · MBChB</p>
          <h1 className="mt-2 font-serif text-2xl font-bold leading-tight text-foreground sm:text-4xl">Course outlines &amp; study checklists</h1>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-bold text-primary"><BadgeCheck className="h-3.5 w-3.5" /> {registry.credit}</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">Every unit, topic by topic, with the matching notes one tap away. Tick topics as you cover them and flag the hard ones for Smart revision.</p>
          <ContentCredit />
          <YearTabs year={year} />
        </div>
      </section>
      <div className="mx-auto max-w-4xl space-y-8 px-5 py-8">
        {!list && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>}
        {curated.length > 0 && (
          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">Department course outlines</h2>
            <p className="mb-3 text-xs text-muted-foreground">Week-by-week scope from the departments.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{curated.map((o) => <Card key={o.id} o={o} />)}</div>
          </section>
        )}
        {autos.length > 0 && (
          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">{curated.length ? "More units — lecture checklists" : "Unit checklists"}</h2>
            <p className="mb-3 text-xs text-muted-foreground">Built from the lecture slides in the library: open a file, read it here, tick it off.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{autos.map((o) => <Card key={o.id} o={o} />)}</div>
          </section>
        )}
        {year === 4 && (
          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">Practise it on the wards</h2>
            <p className="mb-3 text-xs text-muted-foreground">Every Year 4 clinical rotation has realistic cases in the clinical reasoning simulator.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ROTATIONS.map((r) => (
                <Link key={r.id} to={`/clinical?rot=${r.id}`} className="group block min-w-0 rounded-2xl border border-primary/30 bg-primary/5 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/60">
                  <p className="font-serif text-lg font-bold text-foreground">{r.emoji} {r.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.blurb}</p>
                  <p className="mt-2 text-[11px] font-bold text-primary">Open cases →</p>
                </Link>
              ))}
            </div>
          </section>
        )}
        {list && list.length === 0 && <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Nothing for Year {year} yet. <Link to="/course-outlines/year-4" className="font-semibold text-primary hover:underline">See Year 4</Link></p>}
      </div>
    </div>
  );
}

function OutlineLoader({ id }: { id: string }) {
  const curated = COURSE_OUTLINES.find((o) => o.id === id) ?? null;
  const [outline, setOutline] = useState<CourseOutline | null | undefined>(curated ?? undefined);
  useEffect(() => {
    let on = true;
    if (curated) { setOutline(curated); return; }
    setOutline(undefined);
    findOutline(id).then((o) => { if (on) setOutline(o); });
    return () => { on = false; };
  }, [id, curated]);
  if (outline === null) return <Navigate to="/course-outlines" replace />;
  if (!outline) return <div className="mx-auto max-w-4xl space-y-4 px-5 py-14"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-40 w-full rounded-2xl" /><Skeleton className="h-20 w-full rounded-2xl" /></div>;
  return <CourseOutlineView key={outline.id} outline={outline} />;
}

function CourseOutlineView({ outline }: { outline: CourseOutline }) {
  const { user, loading } = useAuth();
  const reg = registry.outlines.find((o) => o.slug === outline.id);
  const { done, toggle, setMany } = useOutlineProgress(user?.id ?? null);
  const flags = useTopicFlags();
  const flagged = useMemo(() => new Set(flags.map((f) => f.id)), [flags]);
  const [remainingOnly, setRemainingOnly] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<number | null>(null);
  const [fileViewing, setFileViewing] = useState<number | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [siblings, setSiblings] = useState<CourseOutline[]>([]);
  const signedIn = Boolean(user);

  const all = useMemo(() => outline.sections.flatMap((s) => s.items.map((i) => ({ ...i, section: s }))), [outline]);
  const doneCount = all.filter((i) => done.has(i.id)).length;
  const next = all.find((i) => !done.has(i.id));
  const docs: DriveFile[] = (outline.documents ?? []).map((d) => [d.fileId, d.name, "pdf"]);
  const topicFiles = useMemo(() => all.filter((i) => i.file).map((i) => i.file as DriveFile), [all]);
  const libraryHref = `/library/year-${outline.year}${outline.librarySlugs ? `/${outline.librarySlugs.join("/")}` : ""}`;
  const metaPath = `/course-outlines/${outline.id}`;
  const meta = reg ? outlineMeta(registry, reg) : null;
  const shareTitle = meta?.title ?? `${outline.title} | ${registry.brand}`;
  const shareText = `✅ ${outline.title} — ${all.length} ${outline.auto ? "files" : "topics"} to tick off${signedIn && doneCount ? `. I'm ${pct(doneCount, all.length)}% through` : ""}.\n${(registry.seoCredit ?? registry.credit)} · ${registry.brand}`;

  useEffect(() => {
    updateMetaTags({
      title: shareTitle,
      description: meta?.description ?? `${outline.title}: ${outline.summary} ${(registry.seoCredit ?? registry.credit)}.`,
      image: `${SITE_URL}${meta?.ogImage ?? "/og/library/outline-all.jpg"}`,
      url: `${SITE_URL}${metaPath}`,
      type: "website",
    });
    try { localStorage.setItem("ompath_last_outline", JSON.stringify({ id: outline.id, title: outline.department, year: outline.year })); } catch { /* storage blocked */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outline.id]);

  useEffect(() => { let on = true; libraryFileNames(outline.year).then((n) => { if (on) setNames(n); }); return () => { on = false; }; }, [outline.year]);
  useEffect(() => { let on = true; loadYearOutlines(outline.year).then((l) => { if (on) setSiblings(l); }); return () => { on = false; }; }, [outline.year]);

  // Open the section named in the link (#item-id) or the first one that still has work left.
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    const target = hash ? outline.sections.find((s) => s.items.some((i) => i.id === hash)) : undefined;
    const first = target ?? outline.sections.find((s) => s.items.some((i) => !done.has(i.id))) ?? outline.sections[0];
    setOpen(new Set(first ? [first.id] : []));
    if (target) window.setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "center" }), 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outline.id, signedIn]);

  const toggleOpen = (id: string) => setOpen((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const hardCount = all.filter((i) => flagged.has(i.id)).length;

  return (
    <div className="min-h-dvh bg-muted/20">
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="mx-auto max-w-4xl px-5 py-10 sm:py-14">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary"><Link to={`/course-outlines/year-${outline.year}`} className="hover:underline">Year {outline.year}</Link> · MBChB</p>
              <h1 className="mt-2 font-serif text-2xl font-bold leading-tight text-foreground sm:text-4xl">{outline.department} {outline.auto ? "study checklist" : "course outline"} &amp; progress tracker</h1>
            </div>
            <div className="flex gap-2 print:hidden">
              <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-bold hover:border-primary/50"><Printer className="h-4 w-4" /> Print</button>
              <ShareButton url={`${SITE_URL}${metaPath}`} title={shareTitle} text={shareText} />
            </div>
          </div>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-bold text-primary"><BadgeCheck className="h-3.5 w-3.5" /> {registry.credit}</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {outline.auto ? "Every file in this unit as a checklist." : "Every week and topic from your department outline."} Tick each one when you have covered it, flag the hard ones, and use the unticked list to plan revision.
          </p>
          <nav className="mt-5 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible print:hidden" aria-label="Units in this year" style={{ scrollbarWidth: "none" }}>
            <Link to={`/course-outlines/year-${outline.year}`} className="shrink-0 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-bold text-foreground hover:border-primary/50">All Year {outline.year}</Link>
            {siblings.map((o) => {
              const active = o.id === outline.id;
              const total = countItems(o);
              const d = o.sections.reduce((n, s) => n + s.items.filter((i) => done.has(i.id)).length, 0);
              return (
                <Link key={o.id} to={`/course-outlines/${o.id}`} aria-current={active ? "page" : undefined} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/50"}`}>
                  {o.department} <span className={`ml-1 ${active ? "opacity-80" : "text-muted-foreground"}`}>{signedIn ? `${pct(d, total)}%` : total}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </section>

      <div className="mx-auto max-w-4xl space-y-5 px-5 py-8">
        {!signedIn && !loading && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 print:hidden">
            <p className="flex items-center gap-2 text-sm text-foreground"><Lock className="h-4 w-4 text-primary" /> Sign in to tick topics off — your progress is saved for your account.</p>
            <Link to="/login" className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90">Sign in</Link>
          </div>
        )}

        <article className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <h2 className="font-serif text-xl font-bold text-foreground">{outline.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{outline.summary}</p>
          {outline.team && <p className="mt-2 text-xs leading-relaxed text-muted-foreground"><span className="font-bold text-foreground">Teaching team:</span> {outline.team}</p>}
          {outline.assessment && <p className="mt-1 text-xs leading-relaxed text-muted-foreground"><span className="font-bold text-foreground">Assessment:</span> {outline.assessment}</p>}
          {outline.info && outline.info.length > 0 && (
            <details className="group mt-3 rounded-xl border border-border bg-background p-3">
              <summary className="cursor-pointer list-none text-sm font-bold text-foreground">Course information <span className="text-xs font-semibold text-muted-foreground">· units, outcomes, requirements, books</span></summary>
              <div className="mt-3 space-y-4">
                {outline.info.map((block) => (
                  <section key={block.heading}>
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-primary">{block.heading}</h3>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">{block.lines.map((l) => <li key={l}>{l}</li>)}</ul>
                  </section>
                ))}
              </div>
            </details>
          )}

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs font-bold">
              <span className="text-foreground">{signedIn ? `${doneCount} of ${all.length} ${outline.auto ? "files" : "topics"} done` : `${all.length} ${outline.auto ? "files" : "topics"}`}{hardCount > 0 ? ` · ${hardCount} flagged hard` : ""}</span>
              <span className="text-primary">{signedIn ? `${pct(doneCount, all.length)}%` : ""}</span>
            </div>
            <Bar value={signedIn ? pct(doneCount, all.length) : 0} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2 print:hidden">
            <Link to={libraryHref} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold text-foreground hover:border-primary/50 hover:text-primary">
              <FolderOpen className="h-3.5 w-3.5" /> All notes &amp; files for this {outline.librarySlugs ? "unit" : "year"}
            </Link>
            {(outline.documents ?? []).map((d, i) => (
              <button key={d.fileId} onClick={() => setViewing(i)} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold text-foreground hover:border-primary/50 hover:text-primary">
                <FileText className="h-3.5 w-3.5" /> {d.label}
              </button>
            ))}
          </div>
        </article>

        {signedIn && next && (
          <button
            type="button"
            onClick={() => { setOpen((cur) => new Set(cur).add(next.section.id)); window.setTimeout(() => document.getElementById(next.id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60); }}
            className="flex w-full items-start gap-3 rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10 print:hidden"
          >
            <Target className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-primary">Next up</span>
              <span className="block break-words text-sm font-bold text-foreground">{next.title}</span>
              <span className="block text-xs text-muted-foreground">{next.section.title}{next.week ? ` · ${next.week}` : ""}</span>
            </span>
          </button>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <h2 className="font-serif text-lg font-bold text-foreground">{outline.auto ? "Files to cover" : "Weekly scope"}</h2>
          <div className="flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted-foreground">
              <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" /> Only flagged
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted-foreground">
              <input type="checkbox" checked={remainingOnly} onChange={(e) => setRemainingOnly(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" disabled={!signedIn} /> Only what is left
            </label>
          </div>
        </div>

        <div className="space-y-3">
          {outline.sections.map((section) => (
            <SectionCard
              key={section.id}
              outline={outline}
              section={section}
              done={done}
              flagged={flagged}
              signedIn={signedIn}
              names={names}
              open={open.has(section.id)}
              remainingOnly={remainingOnly && signedIn}
              flaggedOnly={flaggedOnly}
              onOpen={() => toggleOpen(section.id)}
              onToggle={toggle}
              onMany={setMany}
              onView={(file) => setFileViewing(topicFiles.findIndex((f) => f[0] === file[0]))}
            />
          ))}
        </div>

        <p className="flex items-start gap-2 pb-6 text-xs leading-relaxed text-muted-foreground">
          <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {outline.auto ? "Built from the lecture slides in the library." : "Based on the department course outline."} Ticks are saved for your account in this browser — if you switch devices or clear browser data, they will not follow you yet.
        </p>
      </div>

      <DriveFileViewer items={docs} index={viewing} onIndexChange={setViewing} onDownload={(f) => startDownload(f[0], f[1])} where={outline.department} />
      <DriveFileViewer items={topicFiles} index={fileViewing} onIndexChange={setFileViewing} onDownload={(f) => startDownload(f[0], f[1])} where={outline.department} />
    </div>
  );
}

interface CardProps {
  outline: CourseOutline;
  section: OutlineSection;
  done: Set<string>;
  flagged: Set<string>;
  signedIn: boolean;
  names: string[];
  open: boolean;
  remainingOnly: boolean;
  flaggedOnly: boolean;
  onOpen: () => void;
  onToggle: (id: string) => void;
  onMany: (ids: string[], value: boolean) => void;
  onView: (file: DriveFile) => void;
}

function SectionCard({ outline, section, done, flagged, signedIn, names, open, remainingOnly, flaggedOnly, onOpen, onToggle, onMany, onView }: CardProps) {
  const ids = section.items.map((i) => i.id);
  const doneN = ids.filter((id) => done.has(id)).length;
  const complete = signedIn && doneN === ids.length && ids.length > 0;
  const [conn, setConn] = useState<Set<string>>(new Set());
  const items = section.items.filter((i) => (!remainingOnly || !done.has(i.id)) && (!flaggedOnly || flagged.has(i.id)));
  if ((remainingOnly || flaggedOnly) && items.length === 0) return null;

  return (
    <section className={`overflow-hidden rounded-2xl border bg-card ${complete ? "border-primary/40" : "border-border"}`}>
      <button type="button" onClick={onOpen} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${complete ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
          {complete ? <CheckCheck className="h-4 w-4" /> : signedIn ? `${pct(doneN, ids.length)}` : ids.length}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-bold text-foreground">{section.title}</span>
          <span className="block text-[11px] text-muted-foreground">{signedIn ? `${doneN} of ${ids.length} done` : `${ids.length} ${outline.auto ? "files" : "topics"}`}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {signedIn && <Bar value={pct(doneN, ids.length)} className="mx-4 mb-3 h-1.5" />}

      {open && (
        <div className="border-t border-border">
          {section.note && <p className="bg-muted/30 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">{section.note}</p>}
          {signedIn && (
            <div className="flex gap-2 px-4 pt-3 print:hidden">
              <button onClick={() => onMany(ids, true)} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-[11px] font-bold hover:border-primary/50 hover:text-primary"><CheckCheck className="h-3 w-3" /> Mark all done</button>
              <button onClick={() => onMany(ids, false)} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-[11px] font-bold hover:border-primary/50 hover:text-primary"><RotateCcw className="h-3 w-3" /> Clear</button>
            </div>
          )}
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const isDone = done.has(item.id);
              const isFlagged = flagged.has(item.id);
              const hit = item.file ? null : findNotes(item.title, names);
              return (
                <li key={item.id} id={item.id} className="[content-visibility:auto] [contain-intrinsic-size:auto_64px]">
                  <div className="flex items-start gap-2 pr-2">
                    <label className={`flex min-w-0 flex-1 items-start gap-3 px-4 py-3 ${signedIn ? "cursor-pointer hover:bg-primary/5" : "cursor-not-allowed opacity-80"}`}>
                      <input
                        type="checkbox"
                        checked={isDone}
                        disabled={!signedIn}
                        onChange={() => onToggle(item.id)}
                        className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                        aria-label={`Mark "${item.title}" as done`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          {item.week && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">{item.week}</span>}
                          <span className={`break-words text-sm font-semibold ${isDone ? "text-muted-foreground line-through decoration-primary/50" : "text-foreground"}`}>{item.title}</span>
                        </span>
                        {item.detail && <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{item.detail}</span>}
                        {item.noteSlug && <Link to={`/notes/${item.noteSlug}`} onClick={(e) => e.stopPropagation()} className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"><BookOpen className="h-3 w-3" /> Read Pead Series · Week 1 notes</Link>}
                        {item.lecturer && <span className="mt-0.5 block text-[11px] font-semibold text-muted-foreground">{item.lecturer}</span>}
                        {hit && (
                          <Link to={`/library/year-${outline.year}?q=${encodeURIComponent(hit.q)}`} onClick={(e) => e.stopPropagation()} className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"><Search className="h-3 w-3" /> Find notes ({hit.n})</Link>
                        )}
                      </span>
                    </label>
                    <div className="flex shrink-0 items-center gap-1 pt-2.5 print:hidden">
                      {item.file && (
                        <>
                          <button type="button" onClick={() => onView(item.file as DriveFile)} aria-label={`Read ${item.title}`} className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground hover:bg-primary/90"><Eye className="h-3.5 w-3.5" /><span className="hidden sm:inline">Read</span></button>
                          <button type="button" onClick={() => startDownload(item.file![0], item.file![1])} aria-label={`Download ${item.title}`} className="rounded-full border border-primary/30 p-1.5 text-primary hover:bg-primary hover:text-primary-foreground"><Download className="h-3.5 w-3.5" /></button>
                        </>
                      )}
                      <button type="button" onClick={() => setConn((c) => { const n = new Set(c); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; })} aria-pressed={conn.has(item.id)} aria-label={`Show what connects to ${item.title}`} title="Connected notes, files and other disciplines" className={`rounded-full p-1.5 transition-colors ${conn.has(item.id) ? "text-primary" : "text-muted-foreground/50 hover:text-primary"}`}><Link2 className="h-4 w-4" /></button>
                      <button
                        type="button"
                        onClick={() => toggleFlag({ id: item.id, outlineId: outline.id, outlineTitle: outline.department, title: item.title })}
                        aria-pressed={isFlagged}
                        aria-label={isFlagged ? `Remove the hard flag from ${item.title}` : `Flag ${item.title} as hard`}
                        title={isFlagged ? "Flagged as hard — it will come back in Smart revision" : "Flag as hard"}
                        className={`rounded-full p-1.5 transition-colors ${isFlagged ? "text-rose-600" : "text-muted-foreground/50 hover:text-rose-600"}`}
                      ><Flag className={`h-4 w-4 ${isFlagged ? "fill-current" : ""}`} /></button>
                    </div>
                  </div>
                  {conn.has(item.id) && <div className="px-4 pb-3 print:hidden"><ConnectedLearning target={{ id: `topic:${item.id}`, title: item.title, where: `${outline.department} ${section.title}`, year: outline.year }} /></div>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
