import { useEffect, useState } from "react";
import TaughtThisWeek from "@/components/TaughtThisWeek";
import HeroAurora from "@/components/HeroAurora";
import RecentlyPublished from "@/components/RecentlyPublished";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowRight, BookMarked, ChevronDown, ChevronRight, CalendarDays, BookOpen, ClipboardCheck, Clock, FileQuestion, FolderOpen, GraduationCap, Images, ListChecks, Pill, Flame, Stethoscope, Trophy } from "lucide-react";
import {
  YEAR_CATEGORIES,
  getPublishedArticleSummaries,
  getCategoryDisplayName,
  buildBlogPath,
  type Article,
} from "@/lib/store";
import { groupNotes, notesForYear } from "@/data/staticNotes";
import { Helmet } from "react-helmet-async";
import { getUnitsForYear, unitPath, type Unit } from "@/lib/academic";
import { Skeleton } from "@/components/ui/skeleton";
import { getYear3Semester } from "@/lib/year3Semesters";
import { SITE_URL } from "@/lib/seo";
import YearUnitNotes from "@/components/YearUnitNotes";
import YearLibrarySection from "@/components/YearLibrarySection";
import { TodayClasses } from "@/components/StudyPanel";
import { useAuth } from "@/hooks/useAuth";

function year3SemesterFor(article: Article): 1 | 2 | 3 | null {
  if ([1, 2, 3].includes(Number(article.semester_number))) return Number(article.semester_number) as 1 | 2 | 3;
  const unit = getCategoryDisplayName(article.category);
  const mapped = getYear3Semester(unit);
  if (mapped) return mapped;
  if (/virology|mycology/i.test(article.title)) return 3;
  if (/bacteriology|parasitology|entomology/i.test(article.title)) return 1;
  if (/hematopathology|haematology/i.test(article.title)) return 2;
  if (/practical/i.test(article.title)) return 3;
  return null;
}

function year3ResourceKind(article: Article): "cat" | "exam" | "notes" {
  const text = `${article.content_type || ""} ${article.title}`;
  if (/\bCAT\b|continuous assessment/i.test(text)) return "cat";
  if (/past paper|supplementary|end[- ]of[- ]year|\bexam(?:ination)?\b/i.test(text)) return "exam";
  return "notes";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

const YEAR_NUMBERS = [1, 2, 3, 4, 5, 6] as const;
const YEAR3_PRIORITY = [
  { title: "Paper 1", description: "Bacteriology and Parasitology II / Medical Entomology", to: "/blog?year=Year%203&track=paper-1" },
  { title: "Paper 2", description: "Medical Mycology and Medical Virology", to: "/blog?year=Year%203&track=paper-2" },
  { title: "General & Systemic Pathology", description: "General principles and organ-system pathology", to: "/blog?year=Year%203&unit=Year%203%3A%20General%20Pathology" },
  { title: "Haematology", description: "Dr. Orata’s reviewed 108-question MCQ bank", to: "/exams/7fd6b778-ec52-4e41-ac34-ee69a7bbe68d/start" },
];

export default function YearHub() {
  const { yearNumber } = useParams();
  const [ttOpen, setTtOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768);
  const location = useLocation();
  const parsedYear = Number(yearNumber);
  const { user } = useAuth();
  const isValidYear = YEAR_NUMBERS.includes(parsedYear as (typeof YEAR_NUMBERS)[number]);

  // Hooks must run unconditionally on every render (Rules of Hooks) — the
  // "invalid year" early return happens further down, after all of them,
  // and each effect guards itself with isValidYear instead.
  const [recent, setRecent] = useState<Article[]>([]);
  const [yearArticles, setYearArticles] = useState<Article[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [canonicalUnits, setCanonicalUnits] = useState<Unit[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(true);

  const yearLabel = isValidYear ? `Year ${parsedYear}` : "";
  const units = isValidYear ? (YEAR_CATEGORIES[yearLabel] || []) : [];
  const hasAponeurosis = parsedYear === 1 || parsedYear === 2;

  useEffect(() => {
    if (!isValidYear) { setRecentLoading(false); return; }
    let alive = true;
    setRecentLoading(true);
    getPublishedArticleSummaries(yearLabel).then(list => {
      if (!alive) return;
      const sorted = [...list].sort((a, b) =>
        new Date(b.updated_at || b.created_at).getTime() -
        new Date(a.updated_at || a.created_at).getTime()
      );
      setRecent(sorted.slice(0, 6));
      setYearArticles(sorted);
      setRecentLoading(false);
    });
    return () => { alive = false; };
  }, [isValidYear, yearLabel]);

  useEffect(() => {
    if (!isValidYear) { setUnitsLoading(false); return; }
    let alive = true;
    setUnitsLoading(true);
    getUnitsForYear(parsedYear).then((list) => {
      if (!alive) return;
      setCanonicalUnits(list);
      setUnitsLoading(false);
    });
    return () => { alive = false; };
  }, [isValidYear, parsedYear]);

  if (!isValidYear) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-16 text-center">
        <h1 className="font-serif text-2xl font-bold text-foreground">Invalid year</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please choose a valid year from the menu.</p>
      </div>
    );
  }

  const title = `${yearLabel} Study Materials | Ompath Study`;
  const description =
    `Browse ${yearLabel} medical study notes, flashcards, MCQs, and exams on Ompath Study.`;
  const keywords =
    `OmpathStudy, ${yearLabel}, medical students Kenya, nursing students Kenya, study notes, MCQs, flashcards, exams, medical education Kenya`;

  const sections = [
    {
      title: "Blog",
      description: "All study notes organized by unit",
      to: `/blog?year=${encodeURIComponent(yearLabel)}`,
      icon: BookOpen,
    },
    {
      title: "Flashcards",
      description: "Quick review cards for this year",
      to: `/flashcards?year=${encodeURIComponent(yearLabel)}`,
      icon: GraduationCap,
    },
    ...(parsedYear >= 4 ? [{
      title: "Pharmacology",
      description: "Cancer drugs, common-condition drugs, interactions, drills",
      to: "/pharmacology",
      icon: Pill,
    }, {
      title: "Must-knows by unit",
      description: "What every Year 4 must know, with progress ticks",
      to: "/must-knows",
      icon: ListChecks,
    }] : []),
    {
      title: "Daily dose",
      description: "Five questions a day, with a streak",
      to: "/daily",
      icon: Flame,
    },
    ...(parsedYear >= 4 ? [{
      title: "Clinical simulator",
      description: "Cold-patient ward rounds, OSCE circuit, ECG stations, drug reasoning, why ladders",
      to: "/clinical",
      icon: Stethoscope,
    }] : []),
    {
      title: "Study map",
      description: "Anatomy, histology, physiology and pathology — connected",
      to: "/study-map",
      icon: BookMarked,
    },
    {
      title: "Smart revision",
      description: "Daily review built from your timetable",
      to: "/revise",
      icon: CalendarDays,
    },
    {
      title: "Exams",
      description: "Timed tests filtered to this year",
      to: `/exams?year=${encodeURIComponent(yearLabel)}`,
      icon: Trophy,
    },
  ];
  const year3Groups = [1, 2, 3].map((semester) => {
    const articles = yearArticles.filter((article) => year3SemesterFor(article) === semester);
    const units = [...new Set(articles.map((article) => getCategoryDisplayName(article.category)).filter((unit) => unit !== "Reference"))].sort();
    return { semester, articles, units, cats: articles.filter((article) => year3ResourceKind(article) === "cat"), exams: articles.filter((article) => year3ResourceKind(article) === "exam"), notes: articles.filter((article) => year3ResourceKind(article) === "notes") };
  });

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:py-12">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="keywords" content={keywords} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SITE_URL}/year/${parsedYear}`} />
        <link rel="canonical" href={`${SITE_URL}/year/${parsedYear}`} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
      </Helmet>

      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted-foreground">
        <Link to="/" className="hover:text-primary">Home</Link> ›{" "}
        <span className="text-foreground">{yearLabel}</span>
      </nav>

      <header className="relative isolate overflow-hidden rounded-3xl p-5 sm:p-8">
        <HeroAurora about="" year={Number(String(yearLabel).replace(/\D/g, "")) || undefined} />
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Your year</p>
        <h1 className="mt-1 font-serif text-4xl font-bold text-foreground sm:text-5xl">{yearLabel}</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">Notes, past papers, questions and files for {yearLabel}, all in one place.</p>
        <nav aria-label="Year shortcuts" className="mt-4 flex flex-col sm:flex-row sm:flex-wrap sm:gap-x-7">
          {sections.filter((x) => ["Blog", "Flashcards", "Exams", "Pharmacology", "Must-knows by unit", "Clinical simulator"].includes(x.title)).map((section) => (
            <Link key={section.title} to={section.to} className="flex items-center gap-3 py-2.5 text-[17px] font-semibold text-foreground transition-colors hover:text-primary">
              <section.icon className="h-5 w-5 shrink-0 text-primary" />
              {section.title.replace("Blog", "Notes").replace("Must-knows by unit", "Must-knows")}
            </Link>
          ))}
          <Link to={`/books/year-${parsedYear}`} className="flex items-center gap-3 py-2.5 text-[17px] font-semibold text-foreground transition-colors hover:text-primary"><BookMarked className="h-5 w-5 shrink-0 text-primary" />Books</Link>
          {(parsedYear <= 4 || parsedYear === 6) && <Link to={`/course-outlines/year-${parsedYear}`} className="flex items-center gap-3 py-2.5 text-[17px] font-semibold text-foreground transition-colors hover:text-primary"><ClipboardCheck className="h-5 w-5 shrink-0 text-primary" />Course outlines</Link>}
        </nav>
      </header>

      {notesForYear(parsedYear).length > 0 && (
        <section className="year-unit-folders mt-8" aria-label={`Study notes for ${yearLabel}`}>
          <div className="mb-3 flex items-end justify-between gap-2">
            <h2 className="flex items-center gap-2 font-serif text-2xl font-bold text-foreground"><BookOpen className="h-5 w-5 text-primary" /> Study notes by unit</h2>
            <Link to={`/notes?year=${parsedYear}`} className="text-sm font-bold text-primary hover:underline">Open the notes page →</Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groupNotes(notesForYear(parsedYear)).map((u) => {
              const list = u.groups.flatMap((g) => g.notes);
              return (
                <li key={u.unit}>
                  <Link to={`/notes?year=${parsedYear}&unit=${encodeURIComponent(u.unit)}`} className="group flex h-full flex-col rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md">
                    <span className="font-serif text-lg font-bold leading-tight group-hover:text-primary">{u.unit}</span>
                    <span className="mt-1 text-xs font-semibold text-muted-foreground">{u.groups.length} section{u.groups.length === 1 ? "" : "s"} · {list.length} note{list.length === 1 ? "" : "s"}</span>
                    <span className="mt-3 flex flex-wrap gap-1.5">{u.groups.slice(0, 4).map((g) => <span key={g.group} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{g.group}</span>)}{u.groups.length > 4 && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">+{u.groups.length - 4}</span>}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {parsedYear === 4 && <Link to="/imed" className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4 hover:bg-primary/10"><span><span className="block font-serif text-lg font-bold">Internal medicine, system by system</span><span className="block text-sm text-muted-foreground">Every topic with ticks, an exam planner and the question of the day.</span></span><ChevronDown className="h-5 w-5 -rotate-90 text-primary" aria-hidden /></Link>}
        </section>
      )}

      <TaughtThisWeek year={parsedYear} className="mt-8" />

      <details open={ttOpen} onToggle={(e) => setTtOpen((e.currentTarget as HTMLDetailsElement).open)} className="group mt-4 rounded-2xl border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-[15px] font-bold text-foreground"><CalendarDays className="h-5 w-5 text-primary" aria-hidden /> {user ? "Your timetable" : "Timetable"}: today's classes</span>
          <span className="text-xs font-semibold text-muted-foreground group-open:hidden">Show</span><span className="hidden text-xs font-semibold text-muted-foreground group-open:inline">Hide</span>
        </summary>
        <div className="border-t border-border px-5 pb-5 pt-4">
          <TodayClasses year={parsedYear} wide />
          {!user && <p className="mt-3 text-[12px] text-muted-foreground"><Link to="/login" className="font-bold text-primary hover:underline">Sign in</Link> and your group is remembered on every visit.</p>}
        </div>
      </details>

      <RecentlyPublished year={parsedYear} limit={10} className="mt-6 !px-0" />


      {(parsedYear === 2 || parsedYear === 3) && !recentLoading && <YearUnitNotes year={parsedYear} articles={yearArticles} />}

      <details className="group mt-6 rounded-2xl border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span className="text-[16px] font-bold text-foreground">Course work library: textbooks, lecture slides, handouts and past papers</span>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="border-t border-border px-2 pb-4"><YearLibrarySection year={parsedYear} /></div>
      </details>

      {parsedYear === 3 && (
        <section className="mt-6 rounded-2xl border-2 border-primary/30 bg-primary/5 p-5 sm:p-6">
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary">Pinned for Year 3</p>
          <h2 className="mt-1 font-serif text-xl font-bold text-foreground">Priority revision units</h2>
          <div className="mt-4 space-y-3">
            {YEAR3_PRIORITY.map((item) => <Link key={item.title} to={item.to} className="group block py-1">
              <span className="flex items-center justify-between gap-2 font-bold text-foreground">{item.title}<ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-0.5" /></span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.description}</span>
            </Link>)}
          </div>
        </section>
      )}

      {parsedYear === 3 && (
        <Link to="/exams?year=Year%203" className="mt-6 flex items-center justify-between gap-4 rounded-2xl border-2 border-primary/30 bg-primary/5 p-5"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">Practice</p><h3 className="mt-1 font-serif text-xl font-bold">Year 3 Exam Centre</h3><p className="mt-1 text-sm text-muted-foreground">Timed MCQs and complete examination practice.</p></div><Trophy className="h-7 w-7 text-primary" /></Link>
      )}

      {hasAponeurosis && (
        <Link
          to={`/blog?year=${encodeURIComponent(yearLabel)}&unit=${encodeURIComponent(`${yearLabel}: Aponeurosis - Anatomy`)}`}
          className="group mt-6 block rounded-2xl border border-primary/25 bg-primary/5 p-5 transition-colors hover:border-primary/50 hover:bg-primary/10"
        >
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-primary/10 p-2.5 text-primary"><Images className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest text-primary">Shared Year 1 &amp; Year 2 resource</p>
              <h2 className="mt-1 font-serif text-xl font-bold text-foreground">Aponeurosis Anatomy Image Spot Bank</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Practise labelled photographs and diagrams, then reveal each answer. This is a visual spot-question bank, not an MCQ quiz.</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">Open image spot bank <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" /></span>
            </div>
          </div>
        </Link>
      )}

      {parsedYear !== 3 && parsedYear !== 2 && <div className="mt-6 rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <BookMarked className="h-4 w-4 text-primary" />
          <h2 className="font-serif text-lg font-bold text-foreground">Units in {yearLabel}</h2>
        </div>
        {unitsLoading ? (
          <div className="flex flex-wrap gap-2" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-7 w-24 rounded-lg" />)}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(canonicalUnits.length ? canonicalUnits : units.map(name => ({ id:name, name, slug:"", legacy_category:`${yearLabel}: ${name}` } as Unit))).map((unit) => (
              <Link key={unit.id} to={unit.slug ? unitPath(parsedYear, unit.slug) : `/blog?year=${encodeURIComponent(yearLabel)}&unit=${encodeURIComponent(unit.legacy_category || "")}`} className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
                {unit.name}
              </Link>
            ))}
          </div>
        )}
      </div>}

      {recentLoading && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5" aria-hidden="true">
          <Skeleton className="mb-3 h-5 w-48" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      )}

      {!recentLoading && recent.length > 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h2 className="font-serif text-lg font-bold text-foreground">Recently Added in {yearLabel}</h2>
          </div>
          <div className="space-y-1">
            {recent.map(a => (
              <Link
                key={a.id}
                to={buildBlogPath(a)}
                state={{ from: `${location.pathname}${location.search}` }}
                className="group flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40"
              >
                <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary">{a.title}</p>
                  <p className="text-[11px] text-muted-foreground">{getCategoryDisplayName(a.category)} · {timeAgo(a.updated_at || a.created_at)}</p>
                </div>
              </Link>
            ))}
          </div>
          <Link
            to={`/blog?year=${encodeURIComponent(yearLabel)}`}
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            View all {yearLabel} articles
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
