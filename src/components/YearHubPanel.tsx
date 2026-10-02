import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookMarked, CalendarDays, FileQuestion, Flame, GraduationCap, ListChecks, Megaphone, Pill, Stethoscope, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getYearFromCategory } from "@/lib/store";
import { loadContestPlatform } from "@/lib/contest-store";
import { useSiteConfig } from "@/lib/siteConfig";
import { TodayClasses, useMyYear } from "@/components/StudyPanel";
import LatestFeed from "@/components/LatestFeed";

const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---- data, each loaded once per visit and shared by every card on the page ----
type Exam = { id: string; title: string; slug: string | null; category: string };
let examsMemo: Promise<Exam[]> | null = null;
function loadExams(): Promise<Exam[]> {
  examsMemo ??= Promise.resolve(
    supabase.from("mcq_sets").select("id,title,slug,category").eq("published", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(300),
  ).then((r) => (r.data ?? []) as Exam[]).catch(() => [] as Exam[]);
  return examsMemo;
}

type BookShelf = { key: string; label: string; subjects: { name: string; b: number[] }[] };
let booksMemo: Promise<BookShelf[]> | null = null;
function loadShelves(): Promise<BookShelf[]> {
  booksMemo ??= fetch(`${import.meta.env.BASE_URL}data/books.json`).then((r) => r.json()).then((d) => d.shelves as BookShelf[]).catch(() => [] as BookShelf[]);
  return booksMemo;
}

type Contest = { id: string; slug: string; title: string; stage: string; startsAt: string | null };
let contestMemo: Promise<Contest[]> | null = null;
function loadContests(): Promise<Contest[]> {
  contestMemo ??= loadContestPlatform().then((p) => p.contests.map((c) => ({ id: c.id, slug: c.slug, title: c.title, stage: String(c.stage), startsAt: c.startsAt ?? null }))).catch(() => [] as Contest[]);
  return contestMemo;
}

function useLoaded<T>(load: () => Promise<T>): T | null {
  const [v, setV] = useState<T | null>(null);
  useEffect(() => { let on = true; load().then((x) => { if (on) setV(x); }); return () => { on = false; }; }, [load]);
  return v;
}

function Panel({ title, icon: Icon, to, toLabel, children }: { title: string; icon: typeof FileQuestion; to?: string; toLabel?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-3.5">
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><Icon className="h-3.5 w-3.5 text-primary" /> {title}</h3>
      {children}
      {to && <Link to={to} className="mt-2 inline-block text-[11px] font-bold text-primary hover:underline">{toLabel ?? "See all"} →</Link>}
    </section>
  );
}

/** Exams published for one year. */
export function YearExamsCard({ year, limit = 5 }: { year: number; limit?: number }) {
  const all = useLoaded(loadExams);
  if (all === null) return <div className="h-32 animate-pulse rounded-xl border border-border bg-muted/40" aria-hidden="true" />;
  const list = all.filter((e) => getYearFromCategory(e.category) === `Year ${year}`);
  // A year with no exams yet still shows the latest ones from other years, so the card is never a dead end.
  const shown = list.length ? list : all;
  return (
    <Panel title={list.length ? `Exams · Year ${year} (${list.length})` : "Latest exams"} icon={FileQuestion} to={`/exams?year=${encodeURIComponent(`Year ${year}`)}`} toLabel={list.length ? "See all" : "Open exams"}>
      {list.length === 0 && <p className="mb-1.5 text-[11px] text-muted-foreground">No Year {year} exams yet. Newest from other years:</p>}
      <ul className="space-y-0.5">
        {shown.slice(0, limit).map((e) => {
          const y = getYearFromCategory(e.category);
          return <li key={e.id}><Link to={`/mcqs/${e.slug || e.id}`} className="block rounded-md px-1.5 py-1 text-xs font-medium text-foreground hover:bg-muted hover:text-primary"><span className="line-clamp-2">{e.title}</span>{!list.length && y && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{y}</span>}</Link></li>;
        })}
      </ul>
    </Panel>
  );
}

/** The year's reference books, shelved by subject (from the Books page data). */
export function YearBooksCard({ year, limit = 8 }: { year: number; limit?: number }) {
  const shelves = useLoaded(loadShelves);
  if (shelves === null) return <div className="h-32 animate-pulse rounded-xl border border-border bg-muted/40" aria-hidden="true" />;
  const shelf = shelves.find((s) => s.key === `year-${year}`);
  if (!shelf) return null;
  const total = new Set(shelf.subjects.flatMap((s) => s.b)).size;
  return (
    <Panel title={`Books · Year ${year} (${total})`} icon={BookMarked} to={`/books/year-${year}`} toLabel={`Open the Year ${year} shelf`}>
      <div className="flex flex-wrap gap-1.5">
        {shelf.subjects.slice(0, limit).map((s) => (
          <Link key={s.name} to={`/books/year-${year}/${slug(s.name)}`} className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-bold text-foreground hover:border-primary/50 hover:text-primary">{s.name.split(" (")[0]} <span className="opacity-60">{s.b.length}</span></Link>
        ))}
        {shelf.subjects.length > limit && <span className="px-1 py-1 text-[11px] text-muted-foreground">+{shelf.subjects.length - limit} more</span>}
      </div>
    </Panel>
  );
}

/** Contests that are running or coming up. */
export function ContestsCard({ limit = 3 }: { limit?: number }) {
  const all = useLoaded(loadContests);
  if (all === null) return null;
  const live = all.filter((c) => !/closed|archived|complete|cancel/i.test(c.stage)).slice(0, limit);
  return (
    <Panel title="Contests" icon={Trophy} to="/contests">
      {live.length === 0 ? <p className="text-[11px] text-muted-foreground">No contest is open right now. Check back soon.</p> : (
        <ul className="space-y-0.5">{live.map((c) => <li key={c.id}><Link to={`/contests/${c.slug}`} className="block rounded-md px-1.5 py-1 text-xs font-medium text-foreground hover:bg-muted hover:text-primary"><span className="line-clamp-2">{c.title}</span><span className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.stage.replace(/_/g, " ")}{c.startsAt ? ` · ${new Date(c.startsAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}</span></Link></li>)}</ul>
      )}
    </Panel>
  );
}

/** The site-wide announcement set by the admin, if any. */
export function AnnouncementCard() {
  const { announcement: a } = useSiteConfig();
  if (!a.enabled || !a.text) return null;
  const body = <span className="text-xs font-semibold leading-snug text-foreground">{a.text}</span>;
  return (
    <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
      <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-700"><Megaphone className="h-3.5 w-3.5" /> Notice</h3>
      {a.link ? <Link to={a.link} className="block hover:underline">{body}</Link> : body}
    </section>
  );
}

/**
 * Everything for one year in one place. Shown wherever a page would otherwise be empty,
 * so a filter with no results still leaves the learner somewhere useful to go.
 */
export default function YearHubPanel({ year }: { year: number }) {
  const tools = [
    { to: `/flashcards?year=${encodeURIComponent(`Year ${year}`)}`, label: "Flashcards", icon: GraduationCap },
    { to: "/daily", label: "Daily dose", icon: Flame },
    ...(year >= 4 ? [{ to: "/clinical", label: "Clinical simulator", icon: Stethoscope }, { to: "/pharmacology", label: "Pharmacology", icon: Pill }, { to: "/must-knows", label: "Must-knows", icon: ListChecks }] : []),
    { to: `/timetable/year-${year}`, label: "Full timetable", icon: CalendarDays },
  ];
  return (
    <div className="space-y-3">
      <AnnouncementCard />
      <div className="grid gap-3 lg:grid-cols-2">
        <YearExamsCard year={year} limit={6} />
        <YearBooksCard year={year} limit={10} />
        <Panel title={`Year ${year} classes`} icon={CalendarDays}><TodayClasses year={year} /></Panel>
        <ContestsCard />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {tools.map((t) => <Link key={t.label} to={t.to} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-bold text-foreground transition-colors hover:border-primary/50 hover:text-primary"><t.icon className="h-4 w-4 text-primary" /> {t.label}</Link>)}
      </div>
      <div className="grid gap-3 lg:grid-cols-3"><LatestFeed /></div>
    </div>
  );
}

/** For empty pages: the learner's own year (or the one being browsed) with everything useful in it. */
export function EmptyStateHub({ year }: { year?: number | null }) {
  const [mine] = useMyYear(year);
  return (
    <div className="mt-8 text-left">
      <p className="mb-3 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">Meanwhile in Year {mine}</p>
      <YearHubPanel year={mine} />
    </div>
  );
}
