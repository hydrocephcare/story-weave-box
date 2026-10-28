import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Flame, History, Pill, RotateCcw, Stethoscope } from "lucide-react";
import { BUILTIN_CASES } from "@/clinical";
import { ALL_PDRUGS } from "@/pharm";
import type { MCQ } from "@/clinical/types";
import McqSeries, { ResultCard, type SeriesResult } from "@/components/clinical/McqSeries";
import { buildDeck, readLog } from "@/pages/DailyDose";
import { updateMetaTags } from "@/lib/seo";
import { logStudy } from "@/lib/studyLog";
import { useEffect } from "react";

const WEEKLY_KEY = "ompath_weekly_v1";
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayNum = (key: string) => { const [y, m, d] = key.split("-").map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000); };
const short = (t: string, n: number) => (t.length > n ? `${t.slice(0, n).replace(/[\s,;:]+\S*$/, "")}…` : t);
const seeded = (seed: number) => () => { let t = (seed += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const shuffled = <T,>(a: T[], seed: number) => { const r = seeded(seed), b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

/** The drug and the case of a given date: the same rule the home page and the hub use, so a past day can be replayed exactly. */
const drugFor = (key: string) => ALL_PDRUGS[(dayNum(key) * 7919) % ALL_PDRUGS.length];
const caseFor = (key: string) => BUILTIN_CASES[dayNum(key) % BUILTIN_CASES.length];

function drugQuestion(key: string): MCQ | null {
  const d = drugFor(key);
  if (!d) return null;
  const r = seeded(dayNum(key));
  const near = ALL_PDRUGS.filter((x) => x.id !== d.id && x.cls === d.cls);
  const far = ALL_PDRUGS.filter((x) => x.id !== d.id && x.cls !== d.cls);
  const wrong = [...shuffled(near, dayNum(key)).slice(0, 2), ...shuffled(far, dayNum(key) + 1)].filter((x, i, all) => all.findIndex((y) => y.name === x.name) === i).slice(0, 3);
  const options = shuffled([{ t: d.name, ok: true, why: `${d.name} is a ${d.cls}.` }, ...wrong.map((w) => ({ t: w.name, ok: false, why: `${w.name} is a ${w.cls}, not this one.` }))], dayNum(key) + 2);
  void r;
  return { id: `wk-drug-${key}`, skill: "pharmacology", q: `Drug of the day: which drug is this? It is a ${d.cls}. Used for: ${short(d.why, 140)} How it works: ${short(d.mech, 150)}`, options, hints: [`Think about the class: ${d.cls}.`], explain: `${d.name} (${d.cls}). Used for: ${d.why} How it works: ${d.mech}` };
}

function caseQuestion(key: string): MCQ | null {
  const c = caseFor(key);
  if (!c) return null;
  return { ...c.dx.q, id: `wk-case-${key}`, q: `Case of the day: ${c.vignette} ${c.dx.q.q}` };
}

const dayQuestions = (key: string): MCQ[] => [...buildDeck(key), drugQuestion(key), caseQuestion(key)].filter(Boolean) as MCQ[];

function readWeekly(): Record<string, number> { try { const v = JSON.parse(localStorage.getItem(WEEKLY_KEY) ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } }

export default function WeekReview() {
  const [log] = useState(readLog);
  const [weekly, setWeekly] = useState(readWeekly);
  const [run, setRun] = useState<{ title: string; qs: MCQ[]; week?: boolean; n: number } | null>(null);
  const [res, setRes] = useState<SeriesResult | null>(null);
  useEffect(() => { updateMetaTags({ title: "This week — replay your daily questions | Ompath Study", description: "Rewind the week: replay any day's questions, the drug and the case of the day, and test yourself on everything you studied this week." }); }, []);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); const key = keyOf(d); return { key, label: i === 0 ? "Today" : i === 1 ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" }), drug: drugFor(key), cs: caseFor(key) }; }), []);
  const weekKey = days[6].key;
  const scored = days.filter((d) => log[d.key] !== undefined);
  const avg = scored.length ? Math.round(scored.reduce((s, d) => s + log[d.key], 0) / scored.length) : null;

  const start = (title: string, qs: MCQ[], week = false) => { setRes(null); setRun({ title, qs, week, n: (run?.n ?? 0) + 1 }); window.scrollTo({ top: 0 }); };
  const weekQs = () => days.flatMap((d) => dayQuestions(d.key));
  const quick = () => start("Quick check: 12 questions from this week", shuffled(weekQs(), dayNum(weekKey)).slice(0, 12), true);
  const full = () => start("Full week test", weekQs(), true);
  const finish = (r: SeriesResult) => {
    setRes(r); logStudy(5);
    if (run?.week) { const next = { ...weekly, [weekKey]: r.pct }; setWeekly(next); try { localStorage.setItem(WEEKLY_KEY, JSON.stringify(next)); } catch { /* storage blocked */ } }
  };

  return (
    <div className="min-h-dvh bg-muted/20">
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="mx-auto max-w-2xl px-4 py-7 sm:px-5 sm:py-10">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary"><History className="h-4 w-4" aria-hidden /> Rewind</p>
          <h1 className="mt-1 font-serif text-2xl font-bold text-foreground sm:text-4xl">This week</h1>
          <p className="mt-2 text-sm text-muted-foreground">Everything from the last seven days in one place: the daily questions, the drug and the case of each day. Replay a day, or test yourself on the whole week.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-amber-800"><Flame className="h-4 w-4" aria-hidden /> {scored.length}/7 days done</span>
            {avg !== null && <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">Average {avg}%</span>}
            {weekly[weekKey] !== undefined && <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-800">Last week test {weekly[weekKey]}%</span>}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-5">
        {run ? (
          <div className="space-y-3">
            <p className="text-sm font-bold text-foreground">{run.title}</p>
            {!res ? <McqSeries key={run.n} qs={run.qs} labels={run.qs.map((_, i) => `Question ${i + 1} of ${run.qs.length}`)} onFinish={finish} finishLabel="See my score" /> : (
              <>
                <ResultCard title={run.week ? "Week test complete" : "Day replay complete"} pct={res.pct}><p className="mt-1 text-xs text-muted-foreground">{res.pct >= 75 ? "Solid. This week is sticking." : "Replay the days you missed to lock them in."}</p></ResultCard>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => start(run.title, run.qs, run.week)} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-bold hover:border-primary/50"><RotateCcw className="h-4 w-4" aria-hidden /> Try again</button>
                  <button type="button" onClick={() => { setRun(null); setRes(null); }} className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Back to the week</button>
                  <Link to="/clinical/mistakes" className="rounded-full border border-border px-5 py-2.5 text-sm font-bold hover:border-primary/50">Mistakes notebook</Link>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <h2 className="font-serif text-lg font-bold text-foreground">Test yourself on the whole week</h2>
              <p className="mt-1 text-xs text-muted-foreground">Questions from all seven days, plus one drug question and one case question for each day.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={quick} className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Quick check (12)</button>
                <button type="button" onClick={full} className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold hover:border-primary/50">Full week ({weekQs().length})</button>
              </div>
            </section>

            <ul className="space-y-3">
              {days.map((d) => (
                <li key={d.key} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-sm font-bold text-foreground"><CalendarDays className="h-4 w-4 text-primary" aria-hidden /> {d.label}</p>
                    <span className={`text-xs font-bold ${log[d.key] === undefined ? "text-muted-foreground" : log[d.key] >= 75 ? "text-emerald-700" : "text-amber-700"}`}>{log[d.key] === undefined ? "Not done" : `Daily dose ${log[d.key]}%`}</span>
                  </div>
                  <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    {d.drug && <Link to={`/pharmacology/drug/${d.drug.id}?card=1`} className="flex items-start gap-2 rounded-xl bg-muted/50 p-2.5 hover:bg-muted"><Pill className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /><span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Drug of the day</span><span className="block font-bold text-foreground">{d.drug.name}</span><span className="block truncate text-xs text-muted-foreground">{d.drug.cls}</span></span></Link>}
                    {d.cs && <Link to={`/clinical/case/${d.cs.id}?mode=full`} className="flex items-start gap-2 rounded-xl bg-muted/50 p-2.5 hover:bg-muted"><Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /><span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Case of the day</span><span className="block font-bold leading-snug text-foreground">{d.cs.title}</span></span></Link>}
                  </div>
                  <button type="button" onClick={() => start(`${d.label}: replay`, dayQuestions(d.key))} className="mt-3 rounded-full border border-border px-4 py-2 text-xs font-bold hover:border-primary/50">Replay this day ({dayQuestions(d.key).length} questions)</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
