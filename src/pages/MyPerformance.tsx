import { useEffect, useMemo, useState } from "react";
import { useMyYear, yearOfCategory } from "@/hooks/useMyYear";
import { visibleToYear } from "@/lib/noteRank";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Target, TrendingUp, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildMcqPath } from "@/lib/store";
import { Skeleton } from "@/components/ui/skeleton";

type Unit = { category: string; answered: number; correct: number; last_at: string | null; peer_pct: number | null };
type WeakSet = { id: string; title: string; slug: string | null; category: string; answered: number; correct: number };
type Perf = { answered: number; correct: number; peers: number; percentile: number | null; units: Unit[]; weak_sets: WeakSet[] };

const pct = (c: number, a: number) => (a ? Math.round((100 * c) / a) : 0);
const tone = (p: number) => (p >= 70 ? "bg-emerald-500" : p >= 50 ? "bg-amber-500" : "bg-rose-500");

/** /performance: how the signed-in student is doing across the MCQ banks, by unit, with weak areas and a peer comparison. */
export default function MyPerformance() {
  const [rawPerf, setPerf] = useState<Perf | null | undefined>(undefined);
  const { year } = useMyYear();
  useEffect(() => {
    let on = true;
    void Promise.resolve((supabase as any).rpc("my_performance")).then(({ data }: { data: Perf | null }) => { if (on) setPerf(data ?? null); }, () => { if (on) setPerf(null); });
    return () => { on = false; };
  }, []);

  // only the student's year (the position among peers is shown for all years, so it is hidden when filtered)
  const perf = useMemo<Perf | null | undefined>(() => {
    if (!rawPerf || !year) return rawPerf;
    const units = rawPerf.units.filter((u) => visibleToYear(u.category, year));
    return { ...rawPerf, units, weak_sets: rawPerf.weak_sets.filter((w) => visibleToYear(w.category, year)), answered: units.reduce((n, u) => n + u.answered, 0), correct: units.reduce((n, u) => n + u.correct, 0), percentile: null };
  }, [rawPerf, year]);
  const overall = perf ? pct(perf.correct, perf.answered) : 0;
  const weakUnits = (perf?.units ?? []).filter((u) => u.answered >= 5).slice(0, 3);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Helmet><title>My performance | Ompath Study</title><meta name="robots" content="noindex" /></Helmet>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Ompath Study</p>
      <h1 className="mt-1 font-serif text-3xl font-bold sm:text-4xl">My performance</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">Your score on practice questions, unit by unit, your weakest areas, and how you compare with other students. <Link to="/mistakes" className="font-bold text-primary hover:underline">Review your mistakes</Link></p>

      {perf === undefined && <div className="mt-8 space-y-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-40 w-full" /></div>}

      {perf === null && <p className="mt-8 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Sign in and answer some MCQs, and your results will show here.</p>}

      {perf && perf.answered === 0 && (
        <p className="mt-8 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">You have not answered any questions yet. <Link to="/exams" className="font-bold text-primary hover:underline">Start a practice set</Link> and your progress will appear here.</p>
      )}

      {perf && perf.answered > 0 && (
        <>
          <section className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-4">
              <Target className="h-5 w-5 text-primary" aria-hidden />
              <p className="mt-2 font-serif text-3xl font-bold">{overall}%</p>
              <p className="text-xs text-muted-foreground">{perf.correct} of {perf.answered} correct</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <Users className="h-5 w-5 text-primary" aria-hidden />
              <p className="mt-2 font-serif text-3xl font-bold">{perf.percentile != null ? `Top ${Math.max(1, 100 - perf.percentile)}%` : "—"}</p>
              <p className="text-xs text-muted-foreground">{perf.percentile != null ? `Better than ${perf.percentile}% of ${perf.peers} students` : "Shown once 5 students have answered 20+ questions"}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <TrendingUp className="h-5 w-5 text-primary" aria-hidden />
              <p className="mt-2 font-serif text-3xl font-bold">{perf.units.length}</p>
              <p className="text-xs text-muted-foreground">units practised</p>
            </div>
          </section>

          {weakUnits.length > 0 && (
            <p className="mt-5 rounded-xl bg-rose-500/10 p-3 text-sm"><strong>Focus on:</strong> {weakUnits.map((u) => u.category).join(", ")}. These are your lowest scores so far.</p>
          )}

          <h2 className="mt-8 font-serif text-xl font-bold">By unit</h2>
          <ul className="mt-3 space-y-3">
            {perf.units.map((u) => {
              const p = pct(u.correct, u.answered);
              return (
                <li key={u.category} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold">{u.category}</span>
                    <span className="shrink-0 text-sm font-bold">{p}%</span>
                  </div>
                  <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${p} percent correct`}>
                    <div className={`h-full rounded-full ${tone(p)}`} style={{ width: `${p}%` }} />
                    {u.peer_pct != null && <div className="absolute inset-y-0 w-0.5 bg-foreground/70" style={{ left: `${u.peer_pct}%` }} title={`Students average ${u.peer_pct}%`} />}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">{u.correct}/{u.answered} correct{u.peer_pct != null ? ` · students average ${u.peer_pct}% (the line)` : ""}</p>
                </li>
              );
            })}
          </ul>

          {perf.weak_sets.length > 0 && (
            <>
              <h2 className="mt-8 font-serif text-xl font-bold">Practise these again</h2>
              <p className="mt-1 text-sm text-muted-foreground">Question sets where you score lowest.</p>
              <ul className="mt-3 space-y-2">
                {perf.weak_sets.map((s) => {
                  const p = pct(s.correct, s.answered);
                  return (
                    <li key={s.id}>
                      <Link to={buildMcqPath({ id: s.id, title: s.title, slug: s.slug })} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40">
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{s.title}</span><span className="block truncate text-xs text-muted-foreground">{s.category}</span></span>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold text-white ${tone(p)}`}>{p}%</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </main>
  );
}
