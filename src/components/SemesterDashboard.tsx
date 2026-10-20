import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, BookOpen, CalendarDays, CheckCircle2, Clock3, GraduationCap,
  Hospital, Loader2, UsersRound,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  getUnitsForYearSemester,
  getUnitResources,
  type Unit,
  type UnitResource,
} from "@/lib/academic";
import { getProgress, type ResourceProgress } from "@/lib/study";
import { supabase } from "@/integrations/supabase/client";
import { buildMcqPath, buildBlogPath, buildFlashcardPath } from "@/lib/store";
import {
  MBCHB_2026_TRIMESTER_1,
  YEAR_TEACHING_STAFF,
  YEAR_4_ROTATION_GRIDS,
} from "@/lib/timetable2026";

type UnitBundle = { unit: Unit; resources: UnitResource[] };

const YEAR4_CODES: Record<string, string> = {
  "Obstetrics and Gynaecology": "MBOG 4211 / 4212",
  "General Surgery": "MBSG 4611 / 4612",
  "Mental Health/Psychiatry": "MBPS 4511 / 4512",
  "Internal Medicine": "MBIM 4111 / 4112",
  "Pediatrics and Child Health": "MBPE 4311 / 4312",
  "Clinical Pharmacology II": "MBPL 4411",
};

function semesterWeek() {
  const start = new Date(`${MBCHB_2026_TRIMESTER_1.startDate}T00:00:00`);
  const today = new Date();
  const elapsed = Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86400000));
  return Math.floor(elapsed / 7) + 1;
}

function dateRangeForCurrentWeek() {
  const start = new Date(`${MBCHB_2026_TRIMESTER_1.startDate}T00:00:00`);
  const elapsed = Math.max(0, Math.floor((new Date().getTime() - start.getTime()) / 86400000));
  const monday = new Date(start);
  monday.setDate(start.getDate() + Math.floor(elapsed / 7) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    end: sunday.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
  };
}

function shortResourceType(kind: UnitResource["kind"]) {
  if (kind === "article") return "Note";
  if (kind === "mcq") return "MCQ";
  if (kind === "flashcard") return "Flashcards";
  return "Resource";
}

/** One day of a rotation grid: each slot on its own line with the time on the left, so it reads on a phone instead of one long compressed paragraph. */
function slotsOf(text: string): { time: string; what: string }[] {
  return String(text || "").split(/\s*·\s*/).filter(Boolean).map((part) => {
    const m = part.match(/^(\d{1,2}(?::\d{2})?\s*[–-]\s*\d{1,2}(?::\d{2})?)\s+(.*)$/);
    return m ? { time: m[1].replace(/\s+/g, ""), what: m[2] } : { time: "", what: part };
  });
}

function TimetableDay({ row }: { row: { day: string; group1: string; group2: string } }) {
  const same = row.group1.trim() === row.group2.trim();
  const groups = same ? [{ label: "Both groups", text: row.group1 }] : [{ label: "Group 1", text: row.group1 }, { label: "Group 2", text: row.group2 }];
  return (
    <section>
      <h4 className="text-sm font-bold text-foreground">{row.day}</h4>
      <div className="mt-1 space-y-2">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">{g.label}</p>
            <ul className="mt-0.5">
              {slotsOf(g.text).map((x, i) => (
                <li key={i} className="grid grid-cols-[4.5rem_1fr] gap-2 py-0.5 text-[13px] leading-snug">
                  <span className="tabular-nums text-muted-foreground">{x.time}</span>
                  <span className="min-w-0 break-words text-foreground">{x.what}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function SemesterDashboard() {
  const { user } = useAuth();
  const [studyYear, setStudyYear] = useState<number | null>(null);
  const [gridIdx, setGridIdx] = useState(0);
  const [wholeWeek, setWholeWeek] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bundles, setBundles] = useState<UnitBundle[]>([]);
  const [progress, setProgress] = useState<ResourceProgress[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setStudyYear(null);
      setDisplayName("");
      return;
    }

    let alive = true;
    setLoading(true);

    (supabase as any)
      .from("profiles")
      .select("display_name,study_year")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(async ({ data }: { data: any }) => {
        if (!alive) return;
        const year = data?.study_year ? Number(data.study_year) : null;
        setStudyYear(year);
        setDisplayName(data?.display_name || String(user.user_metadata?.full_name || ""));

        if (!year) {
          setLoading(false);
          return;
        }

        const [units, userProgress] = await Promise.all([
          getUnitsForYearSemester(year, 1),
          getProgress(user.id),
        ]);

        const loaded = await Promise.all(
          units.map(async (unit) => ({ unit, resources: await getUnitResources(unit) })),
        );

        if (!alive) return;
        setBundles(loaded);
        setProgress(userProgress);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [user]);

  const progressMap = useMemo(
    () => new Map(progress.map((p) => [`${p.resource_type}:${p.resource_id}`, p])),
    [progress],
  );

  const allResources = useMemo(() => bundles.flatMap((b) => b.resources), [bundles]);
  const completedCount = allResources.filter((r) => progressMap.get(`${r.kind}:${r.id}`)?.status === "completed").length;
  const startedCount = allResources.filter((r) => progressMap.has(`${r.kind}:${r.id}`)).length;
  // reading counts as it happens: a finished note is whole, a note you are part-way through counts for the part you got to
  const share = (r: { kind: string; id: string }) => { const p = progressMap.get(`${r.kind}:${r.id}`); return !p ? 0 : p.status === "completed" ? 1 : Math.min(0.95, Math.max(0.05, (p.progress_percent || 0) / 100)); };
  const completionPercent = allResources.length ? Math.round((allResources.reduce((n, r) => n + share(r), 0) / allResources.length) * 100) : 0;

  const recentRead = useMemo(() => {
    const rows = allResources
      .map((resource) => {
        const p = progressMap.get(`${resource.kind}:${resource.id}`);
        return p ? { resource, progress: p } : null;
      })
      .filter(Boolean) as { resource: UnitResource; progress: ResourceProgress }[];
    return rows
      .sort((a, b) => new Date(b.progress.last_opened_at).getTime() - new Date(a.progress.last_opened_at).getTime())
      .slice(0, 5);
  }, [allResources, progressMap]);

  if (!user || !studyYear) return null;

  const week = semesterWeek();
  const weekDates = dateRangeForCurrentWeek();
  const staff = YEAR_TEACHING_STAFF[studyYear] || [];
  const semesterUnits = bundles;
  const year4 = studyYear === 4;

  return (
    <section className="w-full min-w-0 overflow-x-clip border-b border-border bg-muted/25">
      <div className="mx-auto w-full min-w-0 max-w-6xl px-3 py-6 sm:px-5 sm:py-10">
        <div className="w-full min-w-0 rounded-3xl border border-border bg-card p-3 shadow-sm sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] text-primary">
                <CalendarDays className="h-4 w-4" />
                Your semester
                <span className="text-muted-foreground">·</span>
                {MBCHB_2026_TRIMESTER_1.label}
              </div>
              <h2 className="mt-2 font-serif text-2xl font-bold text-foreground sm:text-3xl">
                {displayName ? `Welcome back, ${displayName.split(" ")[0]}` : "Your study dashboard"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Year {studyYear} · Week {week} · {weekDates.start}–{weekDates.end}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="rounded-2xl border border-border bg-background px-4 py-3 text-center">
                <p className="font-serif text-xl font-bold">{semesterUnits.length || "—"}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Units</p>
              </div>
              <div className="rounded-2xl border border-border bg-background px-4 py-3 text-center">
                <p className="font-serif text-xl font-bold">{staff.length || "—"}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Staff listed</p>
              </div>
              <div className="rounded-2xl border border-border bg-background px-4 py-3 text-center">
                <p className="font-serif text-xl font-bold">{completionPercent}%</p>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Read progress · {startedCount} started</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="mt-7 flex min-h-24 items-center justify-center rounded-2xl border border-dashed border-border text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading your semester map…
            </div>
          ) : (
            <>
              <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {semesterUnits.map(({ unit, resources }) => {
                  const completed = resources.filter((r) => progressMap.get(`${r.kind}:${r.id}`)?.status === "completed").length;
                  const started = resources.filter((r) => progressMap.has(`${r.kind}:${r.id}`)).length;
                  const pct = resources.length ? Math.round((resources.reduce((n, r) => n + share(r), 0) / resources.length) * 100) : 0;
                  const status = pct === 100 && resources.length ? "Completed" : started ? "In progress" : "Not started";
                  return (
                    <Link
                      key={unit.id}
                      to={`/year/${studyYear}/unit/${unit.slug}`}
                      className="group rounded-2xl border border-border bg-background p-4 transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                            {studyYear === 4 ? YEAR4_CODES[unit.name] || "Year 4 clinical unit" : unit.course_code || "Semester 1 unit"}
                          </p>
                          <h3 className="mt-1 line-clamp-2 text-sm font-bold text-foreground group-hover:text-primary">{unit.name}</h3>
                        </div>
                        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                      </div>
                      <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{resources.length} resource{resources.length === 1 ? "" : "s"}</span>
                        <span className="font-semibold">{status}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </Link>
                  );
                })}
              </div>

              <div className="mt-7 grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
                <div className="rounded-2xl border border-border bg-background p-5">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Teaching team</p>
                      <h3 className="mt-1 font-serif text-lg font-bold">Lecturers on the official timetable</h3>
                    </div>
                    <UsersRound className="h-5 w-5 text-primary" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {staff.map((name) => (
                      <span key={name} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground">
                        {name}
                      </span>
                    ))}
                  </div>
                  <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                    Teaching staff shown here are taken from the official September–December 2026 MBChB timetable. Where the timetable says “No lecturer”, Ompath does not invent a name.
                  </p>
                </div>

                <div className="min-w-0 rounded-2xl border border-border bg-background p-3 sm:p-5">
                  <div className="flex min-w-0 items-center gap-2">
                    <BookOpen className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Where you are</p>
                      <h3 className="mt-1 font-serif text-lg font-bold">Study progress</h3>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                      <span className="min-w-0 break-words text-sm text-muted-foreground">{startedCount} started of {allResources.length || 0} available resources</span>
                      <span className="shrink-0 font-serif text-2xl font-bold">{completionPercent}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${completionPercent}%` }} />
                    </div>
                  </div>
                  {recentRead.length ? (
                    <div className="mt-5 space-y-2">
                      {recentRead.map(({ resource, progress: p }) => (
                        <Link key={`${resource.kind}-${resource.id}`} to={resource.kind === "article" ? buildBlogPath(resource) : resource.kind === "flashcard" ? buildFlashcardPath(resource) : buildMcqPath(resource)} className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-3 hover:border-primary/40">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            {p.status === "completed" ? <CheckCircle2 className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold">{resource.title}</span>
                            <span className="text-[10px] text-muted-foreground">{shortResourceType(resource.kind)} · {p.status.replace("_", " ")}</span>
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-5 rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                      You have not started a tracked semester resource yet. Open a unit and start with the available notes.
                    </div>
                  )}
                </div>
              </div>

              {year4 && (
                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr,1fr]">
                  <div className="rounded-2xl border border-border bg-background p-5">
                    <div className="flex items-center gap-2">
                      <Hospital className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Year 4 clinical context</p>
                        <h3 className="mt-1 font-serif text-lg font-bold">Clinical rotations</h3>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      Your 2026 Year 4 timetable places clinical rotations at <strong className="text-foreground">Thika Level 5 Hospital</strong>. It states 36–40 students per rotation, divided into two groups of 18–20.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {["General Surgery", "Internal Medicine", "Reproductive Health", "Paediatrics & Child Health", "Mental Health", "Clinical Pharmacology"].map((x) => (
                        <span key={x} className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">{x}</span>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-border pt-5">
                    <div className="flex items-center gap-2">
                      <Clock3 className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Weekly timetable</p>
                        <h3 className="mt-1 font-serif text-lg font-bold">Group 1 / Group 2</h3>
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                        Rotation grid
                        <select value={gridIdx} onChange={(e) => setGridIdx(Number(e.target.value))} className="rounded-md border border-border bg-background px-2 py-1 text-xs font-bold text-foreground">
                          {YEAR_4_ROTATION_GRIDS.map((g, i) => <option key={g.label} value={i}>{g.label.replace("Published rotation grid", "Grid")}</option>)}
                        </select>
                      </label>
                      <div className="mt-3 space-y-4">
                        {(() => {
                          const grid = YEAR_4_ROTATION_GRIDS[gridIdx] ?? YEAR_4_ROTATION_GRIDS[0];
                          const today = new Date().toLocaleDateString("en-GB", { weekday: "long" });
                          const todays = grid.slots.filter((r) => r.day.toLowerCase().startsWith(today.toLowerCase()));
                          const rows = wholeWeek || todays.length === 0 ? grid.slots : todays;
                          return rows.map((row) => <TimetableDay key={row.day} row={row} />);
                        })()}
                      </div>
                      <button type="button" onClick={() => setWholeWeek((v) => !v)} className="mt-3 text-xs font-bold text-primary hover:underline">{wholeWeek ? "Show only today" : "Show the whole week"}</button>
                    </div>
                    <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                      The official timetable has several rotation grids. All are shown because your own rotation and group are not stored in your profile, so none is guessed.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-primary/5 px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <GraduationCap className="h-4 w-4 text-primary" />
              <span>Teaching period: 7 Sep–4 Dec 2026 · End-semester CAT: 8–12 Dec 2026.</span>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Link to="/timetable-2026" className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
                View Years 1–6 timetable <CalendarDays className="h-3.5 w-3.5" />
              </Link>
              <Link to={`/year/${studyYear}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
                Open full Year {studyYear} curriculum <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
