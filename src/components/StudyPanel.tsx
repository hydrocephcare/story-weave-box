import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, CalendarDays, ClipboardList, Flame, ListChecks, Pill, Download, Network, Stethoscope, Target, FileQuestion, FolderOpen, GraduationCap, Hourglass, MapPin, PenLine, Star, Timer, Trophy } from "lucide-react";
import registry from "@/data/libraries.json";
import { useAuth } from "@/hooks/useAuth";
import { buildBlogPath } from "@/lib/store";
import { getRecentArticles, type RecentArticle } from "@/lib/progress-store";
import { MBCHB_2026_TRIMESTER_1 } from "@/lib/timetable2026";
import { formatUnitEntry, unitNameMap, useSiteConfig, useTimetable } from "@/lib/siteConfig";
import { useStudyLog } from "@/lib/studyLog";
import { libraryPath } from "@/lib/libraryMeta";
import { startDownload } from "@/lib/driveDownload";
import { shelfToFile, toggleSaved, useFileShelf, type ShelfItem } from "@/lib/fileShelf";
import DriveFileViewer, { cleanName, downloadUrl } from "@/components/DriveFileViewer";
import FileThumb from "@/components/FileThumb";
import LatestFeed from "@/components/LatestFeed";
import { AnnouncementCard, ContestsCard, YearBooksCard, YearExamsCard } from "@/components/YearHubPanel";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MY_YEAR_KEY = "ompath_my_year";

const safeGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

/** The year the learner last chose, so the dashboard follows them between pages. */
export function useMyYear(preferred?: number | null): [number, (y: number) => void] {
  const [year, setYear] = useState<number>(() => {
    const saved = Number(safeGet(MY_YEAR_KEY));
    return preferred && preferred >= 1 && preferred <= 6 ? preferred : saved >= 1 && saved <= 6 ? saved : 1;
  });
  useEffect(() => { if (preferred && preferred >= 1 && preferred <= 6) { setYear(preferred); safeSet(MY_YEAR_KEY, String(preferred)); } }, [preferred]);
  return [year, (y) => { setYear(y); safeSet(MY_YEAR_KEY, String(y)); }];
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
const parseDate = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };

/** The next teaching day's sessions for a year, with a group picker that is remembered on this device. */
export function TodayClasses({ year, wide = false }: { year: number; wide?: boolean }) {
  const tables = useTimetable(year);
  const names = unitNameMap(useSiteConfig());
  const groups = useMemo(() => [...new Set(tables.flatMap((t) => t.rows.map((r) => r.group ?? "").filter(Boolean)))].sort(), [tables]);
  const [group, setGroup] = useState("");
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { setGroup(safeGet(`ompath_group_y${year}`) ?? ""); }, [year]);

  const today = new Date();
  const found = useMemo(() => {
    for (let offset = 0; offset < 7; offset++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
      const day = DAYS[d.getDay()];
      const rows = tables.flatMap((t) => t.rows.filter((r) => r.day === day && (!group || !r.group || r.group === group)));
      if (rows.length) return { offset, day, rows };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, group, today.toDateString()]);

  const teachingOver = daysBetween(today, parseDate(MBCHB_2026_TRIMESTER_1.teachingEndDate)) < 0;
  const notStarted = daysBetween(today, parseDate(MBCHB_2026_TRIMESTER_1.startDate)) > 0;
  const pick = (g: string) => { setGroup(g); safeSet(`ompath_group_y${year}`, g); };
  const label = found ? (found.offset === 0 ? "Today" : found.offset === 1 ? "Tomorrow" : found.day) : "";

  if (!tables.length) return <p className="text-xs text-muted-foreground">No timetable published for Year {year} yet.</p>;

  return (
    <div>
      {groups.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Choose your group">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">My group</span>
          {["", ...groups].map((g) => (
            <button key={g || "all"} type="button" onClick={() => pick(g)} aria-pressed={group === g} className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-colors ${group === g ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:border-primary/50"}`}>{g || "All"}</button>
          ))}
        </div>
      )}
      {teachingOver ? (
        <p className="text-xs text-muted-foreground">Trimester 1 teaching ended on 4 Dec. End-of-semester CATs run 8–12 Dec 2026.</p>
      ) : !found ? (
        <p className="text-xs text-muted-foreground">No sessions listed for {group ? `group ${group}` : "this year"} this week.</p>
      ) : (
        <div>
          <p className="mb-1.5 text-[11px] font-bold text-foreground">{notStarted ? "First week · " : ""}{label}{found.offset > 1 ? "" : ` · ${found.day}`}</p>
          <ul className={`space-y-1.5 ${wide ? "sm:grid sm:grid-cols-2 sm:gap-2 sm:space-y-0" : ""}`}>
            {found.rows.flatMap((r, i) => r.entries.map((e, k) => ({ r, i, e, k }))).slice(0, wide ? (showAll ? 60 : 6) : 5).map(({ r, i, e, k }) => {
              const { title, sub } = formatUnitEntry(e, names);
              return (
                <li key={`${i}-${k}`} className="flex items-start gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
                  <Timer className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  <span className="min-w-0 text-[11px] leading-snug"><span className="font-bold text-foreground">{title}</span>{sub && <span className="flex items-center gap-1 text-muted-foreground"><MapPin className="h-2.5 w-2.5 shrink-0" />{sub}</span>}{r.group ? <span className="text-primary"> · group {r.group}</span> : null}</span>
                </li>
              );
            })}
          </ul>
          {wide && !showAll && found.rows.reduce((n, r) => n + r.entries.length, 0) > 6 && <button type="button" onClick={() => setShowAll(true)} className="mt-2 text-[11px] font-bold text-primary hover:underline">Show all {found.rows.reduce((n, r) => n + r.entries.length, 0)} sessions</button>}
          {!wide && found.rows.reduce((n, r) => n + r.entries.length, 0) > 5 && <p className="mt-1 text-[10px] text-muted-foreground">+{found.rows.reduce((n, r) => n + r.entries.length, 0) - 5} more — open the full timetable.</p>}
        </div>
      )}
      <Link to={`/timetable/year-${year}`} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"><CalendarDays className="h-3 w-3" /> Full Year {year} timetable</Link>
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: typeof BookOpen; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><Icon className="h-3.5 w-3.5 text-primary" /> {title}</h3>
      {children}
    </section>
  );
}

function ShelfRow({ item, onOpen }: { item: ShelfItem; onOpen: () => void }) {
  return (
    <li className="group flex items-center gap-2">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <FileThumb id={item.id} kind={item.kind} className="h-9 w-7" />
        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-foreground group-hover:text-primary">{cleanName(item.name)}</span>{item.where && <span className="block truncate text-[10px] text-muted-foreground">{item.where}</span>}</span>
      </button>
      <a href={downloadUrl(item.id)} onClick={(e) => { e.preventDefault(); startDownload(item.id, item.name); }} aria-label={`Download ${cleanName(item.name)}`} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"><Download className="h-3.5 w-3.5" /></a>
    </li>
  );
}

/** Right-hand dashboard: countdown, timetable, shortcuts, continue reading and the learner's saved files. */
export default function StudyPanel({ year: preferredYear }: { year?: number | null }) {
  const { user } = useAuth();
  const [year, setYear] = useMyYear(preferredYear);
  const [recentArticles, setRecentArticles] = useState<RecentArticle[]>([]);
  const { saved, recent } = useFileShelf();
  const [viewer, setViewer] = useState<{ items: ShelfItem[]; index: number } | null>(null);
  useEffect(() => { setRecentArticles(getRecentArticles().slice(0, 3)); }, []);

  const lib = registry.libraries.find((l) => l.year === year);
  let lastOutline: { id: string; title: string; year: number } | null = null;
  try { lastOutline = JSON.parse(localStorage.getItem("ompath_last_outline") ?? "null"); } catch { /* none yet */ }
  const cfg = useSiteConfig();
  const { streak } = useStudyLog();
  const nextDate = cfg.keyDates.filter((d) => d.date && daysBetween(new Date(), parseDate(d.date)) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
  const catIn = nextDate ? daysBetween(new Date(), parseDate(nextDate.date)) : -1;
  const name = (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ?? user?.email?.split("@")[0];

  const links = [
    { to: `/timetable/year-${year}`, label: "Timetable", icon: CalendarDays },
    ...(lib ? [{ to: libraryPath(lib), label: "Drive library", icon: FolderOpen }] : []),
    { to: `/exams?year=${encodeURIComponent(`Year ${year}`)}`, label: "Exams", icon: FileQuestion },
    { to: "/contests", label: "Contests", icon: Trophy },
    { to: `/flashcards?year=${encodeURIComponent(`Year ${year}`)}`, label: "Flashcards", icon: GraduationCap },
    { to: "/essays", label: "Essays", icon: PenLine },
    ...(year <= 4 ? [{ to: `/course-outlines/year-${year}`, label: "Outlines", icon: ClipboardList }] : []),
    { to: "/dashboard", label: "My day", icon: Target },
    { to: "/study-map", label: "Study map", icon: Network },
    ...(year >= 4 ? [{ to: "/clinical", label: "Clinical sim", icon: Stethoscope }, { to: "/pharmacology", label: "Pharmacology", icon: Pill }, { to: "/must-knows", label: "Must-knows", icon: ListChecks }] : []),
    { to: "/daily", label: "Daily dose", icon: Flame },
    { to: "/revise", label: "Smart revision", icon: Timer },
    { to: "/revision-planner", label: "Planner", icon: Hourglass },
  ];

  return (
    <div className="space-y-3">
      <AnnouncementCard />
      <section className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 to-card p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-bold text-foreground">{name ? `Hi ${name} 👋` : "Your study desk"}</p>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="My year" className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] font-bold text-foreground">
            {[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
        </div>
        {catIn >= 0 ? (
          <p className="mt-2 flex items-baseline gap-1.5"><span className="font-serif text-3xl font-bold leading-none text-primary">{catIn}</span><span className="text-[11px] font-semibold text-muted-foreground">day{catIn === 1 ? "" : "s"} to {nextDate?.label}</span></p>
        ) : (
          <p className="mt-2 text-[11px] font-semibold text-muted-foreground">No upcoming dates set</p>
        )}
        <Link to="/revise" className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-700">🔥 {streak}-day streak · Smart revision →</Link>
        {!user && <Link to="/login" className="mt-2 inline-block text-[11px] font-bold text-primary hover:underline">Sign in to keep your progress →</Link>}
      </section>

      <Card title={`Year ${year} classes`} icon={CalendarDays}><TodayClasses year={year} /></Card>

      <YearExamsCard year={year} />
      <YearBooksCard year={year} limit={6} />
      <ContestsCard />

      <Card title="Shortcuts" icon={Star}>
        <div className="grid grid-cols-2 gap-1.5">
          {links.map((l) => (
            <Link key={l.label} to={l.to} className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5 text-[11px] font-bold text-foreground transition-colors hover:border-primary/50 hover:text-primary"><l.icon className="h-3.5 w-3.5 shrink-0 text-primary" /> <span className="truncate">{l.label}</span></Link>
          ))}
        </div>
      </Card>

      {lastOutline && (
        <Card title="Your outline" icon={ClipboardList}>
          <Link to={`/course-outlines/${lastOutline.id}`} className="block truncate rounded-md px-1.5 py-1 text-xs font-bold text-foreground hover:bg-muted hover:text-primary">Continue {lastOutline.title} (Year {lastOutline.year}) →</Link>
        </Card>
      )}

      {recentArticles.length > 0 && (
        <Card title="Continue reading" icon={BookOpen}>
          <ul className="space-y-1">
            {recentArticles.map((a) => <li key={a.id}><Link to={buildBlogPath(a)} className="block truncate rounded-md px-1.5 py-1 text-xs font-medium text-foreground hover:bg-muted hover:text-primary">{a.title}</Link></li>)}
          </ul>
        </Card>
      )}

      <LatestFeed />

      <Card title={`Saved files${saved.length ? ` (${saved.length})` : ""}`} icon={Star}>
        {saved.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">Tap the ☆ on any library file to keep it here for quick access.</p>
        ) : (
          <ul className="space-y-2">{saved.slice(0, 6).map((i, k) => <ShelfRow key={i.id} item={i} onOpen={() => setViewer({ items: saved, index: k })} />)}</ul>
        )}
      </Card>

      {recent.length > 0 && (
        <Card title="Recently opened" icon={FolderOpen}>
          <ul className="space-y-2">{recent.slice(0, 4).map((i, k) => <ShelfRow key={i.id} item={i} onOpen={() => setViewer({ items: recent, index: k })} />)}</ul>
        </Card>
      )}

      <DriveFileViewer
        items={(viewer?.items ?? []).map(shelfToFile)}
        index={viewer ? viewer.index : null}
        onIndexChange={(n) => setViewer((v) => (v && n !== null ? { ...v, index: n } : null))}
        onDownload={(f) => startDownload(f[0], f[1])}
      />
      <p className="px-1 text-center text-[10px] text-muted-foreground">{registry.credit}</p>
    </div>
  );
}

export { toggleSaved };
