import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, Copy, Flame } from "lucide-react";
import { BANK } from "@/clinical/bank";
import { BUILTIN_CASES } from "@/clinical";
import { supabase } from "@/integrations/supabase/client";
import { toItems, type QItem } from "@/components/QuizRunner";
import { useScopedYear } from "@/hooks/useMyYear";
import { buildPharmDrill } from "@/pharm/drills";
import type { MCQ } from "@/clinical/types";
import McqSeries, { ResultCard, type SeriesResult } from "@/components/clinical/McqSeries";
import { updateMetaTags } from "@/lib/seo";
import { logStudy } from "@/lib/studyLog";

const KEY = "ompath_daily_v1";
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export function readLog(): Record<string, number> { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } }

/** A small deterministic generator so everyone gets the same five questions on a given day. */
function rng(seed: string) { let h = 1779033703 ^ seed.length; for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } let a = h >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function withSeed<T>(seed: string, fn: () => T): T { const orig = Math.random; Math.random = rng(seed); try { return fn(); } finally { Math.random = orig; } }

/** The five questions of a date (the same for everyone, and the same whenever it is rebuilt, so any past day can be replayed). */
export function buildDeck(date: string): MCQ[] {
  return withSeed(date, () => {
    const r = Math.random;
    const pickFrom = <T,>(a: T[], n: number) => { const pool = [...a]; const out: T[] = []; while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]); return out; };
    const caseQs = BUILTIN_CASES.flatMap((c) => [...c.consultant, ...c.interpret]);
    return [...pickFrom(BANK as MCQ[], 2), ...pickFrom(caseQs, 1), ...buildPharmDrill("mixed", 2)];
  });
}

/** Years 1 to 3 have no wards: their daily five come from their own year's MCQ sets, picked by the date so everyone in the year gets the same five. */
export async function yearDeck(date: string, year: number): Promise<MCQ[]> {
  let items: QItem[] = [];
  try {
    const { data } = await (supabase as any).from("mcq_sets").select("id,category,questions").eq("published", true).is("deleted_at", null).ilike("category", `Year ${year}:%`).order("id").limit(80);
    items = ((data ?? []) as { id: string; category: string; questions: unknown }[]).flatMap((st) => toItems(st.id, st.category, st.questions)).sort((a, b) => (a.key < b.key ? -1 : 1));
  } catch { /* fall back to pharmacology below */ }
  const picked: QItem[] = withSeed(`${date}-y${year}`, () => { const pool = [...items]; const out: QItem[] = []; while (out.length < 5 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]); return out; });
  const mcqs: MCQ[] = picked.map((q) => ({ id: `yd-${q.key}`, skill: "pathophysiology", q: q.question, options: q.options.map((t, i) => ({ t, ok: i === q.correct, why: i === q.correct ? (q.explanation ?? "") : "" })), hints: [], explain: q.explanation ?? "" }));
  return mcqs.length >= 5 ? mcqs : [...mcqs, ...buildPharmDrill("mixed", 5 - mcqs.length)];
}

/** The five questions of a date for the student's own year (clinical years get the ward mix). */
export function useDayDeck(date: string): { deck: MCQ[] | null; year: number | null; clinical: boolean } {
  const { year, ready } = useScopedYear();
  const clinical = year === null || year >= 4;
  const [deck, setDeck] = useState<MCQ[] | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (clinical) { setDeck(buildDeck(date)); return; }
    let on = true; setDeck(null);
    void yearDeck(date, year!).then((d) => { if (on) setDeck(d); });
    return () => { on = false; };
  }, [date, year, ready, clinical]);
  return { deck, year, clinical };
}

function streakOf(log: Record<string, number>) {
  let s = 0; const d = new Date();
  if (log[today()] === undefined) d.setDate(d.getDate() - 1);
  for (let i = 0; i < 400; i++) { const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; if (log[k] !== undefined) s++; else break; d.setDate(d.getDate() - 1); }
  return s;
}

export default function DailyDose() {
  const date = today();
  const [log, setLog] = useState(readLog);
  const { deck, year, clinical } = useDayDeck(date);
  const [res, setRes] = useState<SeriesResult | null>(null);
  const [round, setRound] = useState(0);
  const doneToday = log[date] !== undefined;
  const [practice, setPractice] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { updateMetaTags({ title: "Daily dose — five questions a day | Ompath Study", description: "Five questions every day, picked for your year. Keep your streak." }); }, []);

  const finish = (r: SeriesResult) => {
    setRes(r); logStudy(3);
    if (!doneToday) { const next = { ...log, [date]: r.pct }; setLog(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ } }
  };
  const streak = streakOf(log);
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (13 - i)); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; return { k, pct: log[k], label: d.toLocaleDateString(undefined, { weekday: "narrow" }) }; });
  const share = async () => { const text = `Ompath Study — Daily dose ${date}: ${res ? Math.round((res.pct / 100) * 5) : "?"}/5 · ${streak}-day streak 🔥`; try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ } };

  return (
    <div className="min-h-dvh bg-muted/20">
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="mx-auto max-w-2xl px-4 py-7 sm:px-5 sm:py-10">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary"><CalendarCheck className="h-4 w-4" /> {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="mt-1 font-serif text-2xl font-bold text-foreground sm:text-4xl">Daily dose</h1>
          <p className="mt-2 text-sm text-muted-foreground">{clinical ? "Five questions — two clinical, one from the wards, two pharmacology. Five minutes, every day. Everyone gets the same five today." : `Five questions from your Year ${year} notes. Five minutes, every day. Everyone in Year ${year} gets the same five today.`}</p>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-800"><Flame className="h-4 w-4" /> {streak}-day streak</p>
          <ol className="mt-4 flex max-w-sm gap-1" aria-label="Last 14 days">{days.map((d) => <li key={d.k} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={d.k}><span className={`h-6 w-full max-w-[1.25rem] rounded-md ${d.pct === undefined ? "bg-muted" : d.pct >= 60 ? "bg-emerald-500" : "bg-amber-500"}`} /><span className="text-[9px] font-bold text-muted-foreground">{d.label}</span></li>)}</ol>
        </div>
      </section>
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-5">
        {doneToday && !practice && !res ? (
          <div className="space-y-3">
            <ResultCard title="Today’s dose is done" pct={log[date]}><p className="mt-1 text-xs text-muted-foreground">Come back tomorrow to keep your streak.</p></ResultCard>
            <Link to="/daily/week" className="block rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm font-bold text-foreground hover:border-primary/60">Rewind this week <span className="block text-xs font-normal text-muted-foreground">Replay any day and test yourself on the whole week</span></Link>
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setPractice(true)} className="rounded-full border border-border px-5 py-2.5 text-sm font-bold hover:border-primary/50">Practise today’s questions again</button><Link to="/clinical/quiz" className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">More questions</Link><Link to="/pharmacology?tab=practice" className="rounded-full border border-border px-5 py-2.5 text-sm font-bold">Pharmacology practice</Link></div>
          </div>
        ) : !res ? (
          deck ? <McqSeries key={round} qs={deck} labels={deck.map((_, i) => `Question ${i + 1} of 5`)} onFinish={finish} finishLabel="See my score" /> : <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Getting today's questions…</p>
        ) : (
          <div className="space-y-3">
            <ResultCard title="Daily dose complete" pct={res.pct}><p className="mt-1 text-xs text-muted-foreground">{doneToday && practice ? "Practice round — your streak score is unchanged." : `${streak}-day streak`}</p></ResultCard>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={share} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-bold hover:border-primary/50"><Copy className="h-4 w-4" /> {copied ? "Copied!" : "Copy my result"}</button>
              <button type="button" onClick={() => { setRes(null); setRound((r) => r + 1); setPractice(true); }} className="rounded-full border border-border px-5 py-2.5 text-sm font-bold hover:border-primary/50">Again</button>
              <Link to="/clinical/mistakes" className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Mistakes notebook</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
