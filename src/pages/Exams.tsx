import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Clock, Flame, ListChecks, PlayCircle, Search, Timer, Trophy, X } from "lucide-react";
import LoadMoreButton from "@/components/LoadMoreButton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { updateMetaTags } from "@/lib/seo";
import { isPublicMcqSet } from "@/lib/content-policy";
import { examUnit, examYear, isWeekly, setPath, shortTitle, weeklyDate, type CatalogRow } from "@/lib/examMeta";

const YEARS = [1, 2, 3, 4, 5, 6];
const DAY = 86_400_000;

type Progress = { pct: number; at: number } | { live: true } | null;

/** What this device remembers about a set: a finished attempt (exam or practice) or an unfinished exam session. */
function progressOf(id: string, mcq: boolean): Progress {
  try {
    const done = localStorage.getItem(mcq ? `mcq_practice_${id}` : `exam_result_${id}`);
    if (done) { const j = JSON.parse(done); const total = Number(j.total) || 0; if (total) return { pct: Math.round((Number(j.score) / total) * 100), at: Number(j.submittedAt || j.at) || 0 }; }
    if (!mcq && localStorage.getItem(`exam_session_${id}`)) return { live: true };
  } catch { /* storage blocked */ }
  return null;
}

const myYear = (): number | null => { try { const y = Number(localStorage.getItem("ompath_my_year")); return y >= 1 && y <= 6 ? y : null; } catch { return null; } };

function useCatalog() {
  const [rows, setRows] = useState<CatalogRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    (supabase as any).rpc("exam_catalog", undefined, { get: true }).then(({ data, error }: { data: CatalogRow[] | null; error: unknown }) => {
      if (!live) return;
      if (error || !data) { setFailed(true); setRows([]); return; }
      setRows(data.filter(isPublicMcqSet).filter((r) => r.question_count > 0));
    });
    return () => { live = false; };
  }, []);
  return { rows, failed };
}

function Card({ row, mcq, featured = false }: { row: CatalogRow; mcq: boolean; featured?: boolean }) {
  const navigate = useNavigate();
  const [progress] = useState(() => progressOf(row.id, mcq));
  const weekly = isWeekly(row.title, row.category);
  const date = weekly ? weeklyDate(row.title) : null;
  const year = examYear(row.category, row.title);
  const fresh = weekly && Date.now() - Date.parse(row.created_at) < 8 * DAY;
  const go = () => navigate(mcq ? `/mcqs/${(row.slug || "").trim() || row.id}` : setPath(row));
  return (
    <button type="button" onClick={go} className={`group relative flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10 active:scale-[.99] ${featured ? "min-h-[190px] sm:p-6" : "min-h-[168px]"}`}>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${weekly ? "bg-primary" : row.kind === "past_paper" ? "bg-amber-500" : "bg-sky-500"}`} />
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider">
        {fresh && <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-primary-foreground"><Flame className="h-3 w-3" aria-hidden /> New</span>}
        {weekly ? <span className="text-primary">Weekly{date ? ` · ${date}` : ""}</span> : row.kind === "past_paper" ? <span className="text-amber-600 dark:text-amber-400">Past paper</span> : <span className="text-sky-600 dark:text-sky-400">{mcq ? "Question bank" : "Unit exam"}</span>}
        {year && <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">Y{year}</span>}
      </div>
      <h3 className={`mt-2 font-serif font-bold leading-snug text-foreground ${featured ? "text-2xl" : "text-lg"}`}>{shortTitle(row.title, row.category)}</h3>
      {(examUnit(row.category) !== shortTitle(row.title, row.category) || row.exam_year) && <p className="mt-1 text-sm text-muted-foreground">{[examUnit(row.category) !== shortTitle(row.title, row.category) ? examUnit(row.category) : "", row.exam_year].filter(Boolean).join(" · ")}</p>}
      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        <span className="inline-flex items-center gap-3 text-xs font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" aria-hidden /> {row.question_count} Qs</span>
          {!mcq && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden /> {row.question_count} min</span>}
        </span>
        {progress && "pct" in progress ? (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${progress.pct >= 50 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {progress.pct}%</span>
        ) : progress && "live" in progress ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-1 text-xs font-bold text-sky-700 dark:text-sky-300"><PlayCircle className="h-3.5 w-3.5" aria-hidden /> Resume</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-sm font-bold text-primary">{mcq ? "Practise" : "Start"} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
        )}
      </div>
    </button>
  );
}

const Skeleton = () => <div className="h-[168px] animate-pulse rounded-2xl border border-border bg-muted/40" />;

/** One page, two lists: /exams holds the timed exams (weekly, unit exams, past papers), /mcqs holds the practice question banks. */
export default function Exams({ mode = "exam" }: { mode?: "exam" | "mcq" }) {
  const mcq = mode === "mcq";
  const [params, setParams] = useSearchParams();
  const { rows, failed } = useCatalog();
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | "weekly" | "past_paper">("all");
  const [unit, setUnit] = useState<string | null>(null);
  const [visible, setVisible] = useState(12);
  const { user } = useAuth();
  const [profileYear, setProfileYear] = useState<number | null>(myYear);
  useEffect(() => {
    if (!user) return;
    (supabase as any).from("profiles").select("study_year").eq("user_id", user.id).maybeSingle().then(({ data }: { data: { study_year?: number | string } | null }) => { const y = Number(data?.study_year); if (y >= 1 && y <= 6) setProfileYear(y); });
  }, [user]);
  const mine = profileYear;
  const yp = params.get("year");
  const year = mine ?? (yp === "all" ? null : Number(/([0-9])/.exec(yp || "")?.[1]) || (yp ? null : mine));   // no choice made yet: show the learner's own year

  useEffect(() => {
    updateMetaTags(mcq
      ? { title: "MCQ Question Banks", description: "Practice multiple-choice questions by topic and unit for Kenyan medical and health-science students, with instant answers and explanations." }
      : { title: "Exam Center", description: "Timed medical exams for Kenyan health students: a new weekly exam for every unit, unit exams and past papers, scored with answers and explanations." });
  }, [mcq]);
  useEffect(() => { setVisible(18); setUnit(null); setType("all"); }, [mcq, year]);

  const pool = useMemo(() => (rows || []).filter((r) => (mcq ? r.kind === "bank" : r.kind !== "bank")), [rows, mcq]);
  const yearCounts = useMemo(() => { const c: Record<number, number> = {}; for (const r of pool) { const y = examYear(r.category, r.title); if (y) c[y] = (c[y] || 0) + 1; } return c; }, [pool]);
  const inYear = useMemo(() => (year ? pool.filter((r) => examYear(r.category, r.title) === year) : pool), [pool, year]);
  const units = useMemo(() => { const n = new Map<string, number>(); for (const r of inYear) { const u = examUnit(r.category); n.set(u, (n.get(u) || 0) + 1); } return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12); }, [inYear]);
  const list = useMemo(() => {
    const needles = q.toLowerCase().split(/\s+/).filter(Boolean);
    return inYear.filter((r) => (type === "all" || (type === "weekly" ? isWeekly(r.title, r.category) : r.kind === "past_paper")) && (!unit || examUnit(r.category) === unit)
      && needles.every((w) => `${shortTitle(r.title, r.category)} ${r.title} ${examUnit(r.category)}`.toLowerCase().includes(w)));
  }, [inYear, q, type, unit]);
  const thisWeek = useMemo(() => (mcq || q || unit || type !== "all" ? [] : inYear.filter((r) => isWeekly(r.title, r.category) && Date.now() - Date.parse(r.created_at) < 8 * DAY).slice(0, 6)), [inYear, mcq, q, unit, type]);
  const featuredIds = new Set(thisWeek.map((r) => r.id));
  const rest = list.filter((r) => !featuredIds.has(r.id));
  const loading = rows === null;

  const seg = (on: boolean) => `shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors ${on ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`;
  const setYear = (y: number | null) => { const next = new URLSearchParams(params); next.set("year", y ? `Year ${y}` : "all"); setParams(next, { replace: true }); };
  const stats = mcq
    ? [[pool.length, "question banks"], [pool.reduce((n, r) => n + r.question_count, 0), "questions"]]
    : [[pool.filter((r) => isWeekly(r.title, r.category)).length, "weekly exams"], [pool.length, "exams in all"]];

  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden border-b border-border bg-[#0b2545] text-white">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-6 px-4 py-9 sm:py-12 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">{mcq ? <ListChecks className="h-4 w-4" aria-hidden /> : <Trophy className="h-4 w-4" aria-hidden />} {mcq ? "Practice" : "Timed exams"}</p>
            <h1 className="mt-2 font-serif text-4xl font-bold leading-tight sm:text-5xl">{mcq ? "MCQ question banks" : "Exam Center"}</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-white/75">
              {mcq ? "Pick a topic, answer at your own pace and see the explanation straight away. Nothing to register, nothing is timed."
                : "A fresh exam for every unit each week, plus unit exams and past papers. Timed, scored, with every answer explained afterwards."}
            </p>
          </div>
          <div className="flex gap-3 text-center">
            {stats.map(([n, label]) => (
              <div key={String(label)} className="min-w-[104px] rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur"><p className="text-3xl font-bold tabular-nums">{loading ? "–" : Number(n).toLocaleString()}</p><p className="text-[11px] font-semibold uppercase tracking-wider text-white/65">{label}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-6xl space-y-3 px-4 py-3">
          <div className={`flex items-center gap-1 overflow-x-auto pb-0.5 ${mine ? "hidden" : ""}`} role="tablist" aria-label="Year">
            <button type="button" role="tab" aria-selected={!year} onClick={() => setYear(null)} className={seg(!year)}>All years</button>
            {YEARS.map((y) => (
              <button key={y} type="button" role="tab" aria-selected={year === y} onClick={() => setYear(y)} className={seg(year === y)}>
                Year {y}{mine === y ? " ★" : ""}<span className={`ml-1.5 text-xs font-semibold ${year === y ? "text-primary-foreground/80" : "text-muted-foreground/70"}`}>{yearCounts[y] || 0}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={mcq ? "Search topics, e.g. cardiology" : "Search units, e.g. pathology"} aria-label="Search" className="h-10 w-full rounded-full border border-input bg-card pl-9 pr-9 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
              {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>}
            </label>
            {!mcq && (
              <div className="flex rounded-full border border-border bg-card p-0.5" role="group" aria-label="Type">
                {([["all", "All"], ["weekly", "Weekly"], ["past_paper", "Past papers"]] as const).map(([k, label]) => <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)} className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors ${type === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>)}
              </div>
            )}
            {units.length > 1 && (
              <select value={unit || ""} onChange={(e) => setUnit(e.target.value || null)} aria-label="Unit" className="h-10 max-w-[200px] rounded-full border border-input bg-card px-4 text-sm font-semibold outline-none focus:border-primary">
                <option value="">All units</option>
                {units.map(([u, n]) => <option key={u} value={u}>{u} ({n})</option>)}
              </select>
            )}
            <span className="ml-auto text-sm font-semibold text-muted-foreground">{loading ? "" : `${list.length} ${mcq ? "banks" : "exams"}`}</span>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-7">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} />)}</div>
        ) : failed ? (
          <p className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">The list did not load. Check your connection and refresh the page.</p>
        ) : (
          <>
            {thisWeek.length > 0 && (
              <div>
                <h2 className="mb-3 flex items-center gap-2 font-serif text-xl font-bold"><Timer className="h-5 w-5 text-primary" aria-hidden /> This week's exams</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{thisWeek.map((r) => <Card key={r.id} row={r} mcq={mcq} featured />)}</div>
              </div>
            )}
            {rest.length > 0 ? (
              <div>
                {thisWeek.length > 0 && <h2 className="mb-3 font-serif text-xl font-bold">All exams</h2>}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{rest.slice(0, visible).map((r) => <Card key={r.id} row={r} mcq={mcq} />)}</div>
                {rest.length > visible && <div className="mt-6 flex justify-center"><LoadMoreButton onMore={() => setVisible((v) => v + 18)} className="inline-flex h-11 items-center justify-center rounded-full border border-input bg-card px-6 text-sm font-bold hover:bg-muted">Show more</LoadMoreButton></div>}
              </div>
            ) : thisWeek.length === 0 && (
              <div className="rounded-3xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
                <Trophy className="mx-auto h-9 w-9 text-muted-foreground/60" aria-hidden />
                <h2 className="mt-3 font-serif text-xl font-bold">{year ? `No ${mcq ? "question banks" : "exams"} for Year ${year} yet` : "Nothing matches"}</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{year && !q ? (mcq ? `Year ${year} banks are added as notes are published.` : `New exams are written every Friday from the notes in each unit, so Year ${year} will fill up week by week.`) : "Try a shorter search or clear the filters."}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {(year || q || unit || type !== "all") && <button type="button" onClick={() => { setQ(""); setUnit(null); setType("all"); setYear(null); }} className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">Clear filters</button>}
                  <Link to={mcq ? "/exams" : "/mcqs"} className="rounded-full border border-border px-5 py-2 text-sm font-bold hover:bg-muted">{mcq ? "Timed exams" : "Practice question banks"}</Link>
                  {year && <Link to={`/year/${year}`} className="rounded-full border border-border px-5 py-2 text-sm font-bold hover:bg-muted">Year {year} notes</Link>}
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-sm">
              <p className="text-muted-foreground">{mcq ? "Want the real thing under time pressure?" : "Prefer to practise at your own pace with instant answers?"}</p>
              <Link to={mcq ? "/exams" : "/mcqs"} className="inline-flex items-center gap-1.5 font-bold text-primary hover:underline">{mcq ? "Go to the Exam Center" : "Open the MCQ banks"} <ArrowRight className="h-4 w-4" aria-hidden /></Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
