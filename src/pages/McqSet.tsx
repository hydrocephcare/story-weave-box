import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Loader2, RotateCcw, Shuffle, X } from "lucide-react";
import OmpathMark from "@/components/ai/OmpathMark";
import { Helmet } from "react-helmet-async";
import { trackAnswer } from "@/lib/answer-tracker";
import { openAI } from "@/lib/aiEvents";
import { isExamLike, resolveMcqSet, type McqQ, type McqSetRow } from "@/lib/mcqSet";
import { examUnit, shortTitle } from "@/lib/examMeta";

const LETTERS = "ABCDEF";
const shuffled = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

type Item = { q: McqQ; index: number };   // index = position in the stored set, for answer tracking

function Ring({ pct }: { pct: number }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 128 128" className="h-36 w-36 -rotate-90" role="img" aria-label={`${pct} percent`}>
      <circle cx="64" cy="64" r={r} fill="none" strokeWidth="11" className="stroke-muted" />
      <circle cx="64" cy="64" r={r} fill="none" strokeWidth="11" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} className={`transition-all duration-700 ${pct >= 70 ? "stroke-emerald-500" : pct >= 50 ? "stroke-amber-500" : "stroke-rose-500"}`} />
    </svg>
  );
}

function Practice({ set }: { set: McqSetRow }) {
  const all: Item[] = useMemo(() => set.questions.map((q, index) => ({ q, index })), [set]);
  const [items, setItems] = useState<Item[]>(all);
  const [pos, setPos] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [results, setResults] = useState<Map<number, boolean>>(new Map());   // by stored index
  const [done, setDone] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const cur = items[pos];

  const pick = useCallback((oi: number) => {
    if (picked !== null || !cur) return;
    setPicked(oi);
    const ok = oi === cur.q.correct_answer;
    setResults((m) => new Map(m).set(cur.index, ok));
    void trackAnswer({ mcq_set_id: set.id, question_index: cur.index, question_text: cur.q.question, selected_answer: oi, correct_answer: cur.q.correct_answer, is_correct: ok }).catch(() => {});
  }, [picked, cur, set.id]);

  const finish = useCallback((rs: Map<number, boolean>) => {
    setDone(true);
    try { localStorage.setItem(`mcq_practice_${set.id}`, JSON.stringify({ score: [...rs.values()].filter(Boolean).length, total: all.length, at: Date.now() })); } catch { /* storage blocked */ }
  }, [set.id, all.length]);

  const next = useCallback(() => {
    if (picked === null) return;
    if (pos + 1 >= items.length) { finish(results); return; }
    setPos((p) => p + 1); setPicked(null);
    top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [picked, pos, items.length, results, finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (done || (e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key.toUpperCase(); const i = LETTERS.indexOf(k);
      if (k.length === 1 && i >= 0 && i < (cur?.q.options.length || 0)) pick(i);
      else if (e.key === "Enter" || e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, cur, pick, next]);

  const restart = (list: Item[]) => { setItems(list); setPos(0); setPicked(null); setResults(new Map()); setDone(false); };
  const correct = [...results.values()].filter(Boolean).length;
  const wrong = items.filter((it) => results.get(it.index) === false);
  const title = shortTitle(set.title, set.category);

  if (done) {
    const pct = Math.round((correct / Math.max(1, items.length)) * 100);
    const verdict = pct >= 85 ? "Excellent" : pct >= 70 ? "Well done" : pct >= 50 ? "Getting there" : "Keep practising";
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="relative mx-auto h-36 w-36"><Ring pct={pct} /><span className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-4xl font-bold tabular-nums">{pct}%</span><span className="text-xs font-semibold text-muted-foreground">{correct} of {items.length}</span></span></div>
          <h2 className="mt-4 font-serif text-2xl font-bold">{verdict}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{title}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {wrong.length > 0 && <button type="button" onClick={() => restart(shuffled(wrong))} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"><RotateCcw className="h-4 w-4" aria-hidden /> Retry the {wrong.length} I missed</button>}
            <button type="button" onClick={() => restart(all)} className="rounded-full border border-border px-5 py-2.5 text-sm font-bold hover:bg-muted">Start again</button>
            <button type="button" onClick={() => restart(shuffled(all))} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-bold hover:bg-muted"><Shuffle className="h-4 w-4" aria-hidden /> Shuffle</button>
          </div>
          {wrong.length > 0 && <button type="button" onClick={() => openAI(`I got these ${title} questions wrong. Explain the ideas behind each one briefly:\n${wrong.slice(0, 8).map((w, i) => `${i + 1}. ${w.q.question}`).join("\n")}`)} className="mx-auto mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline"><OmpathMark className="h-6 w-6" /> Ask Ompath AI to explain what I missed</button>}
        </div>
        {wrong.length > 0 && (
          <div className="mt-6 space-y-3">
            <h3 className="font-serif text-lg font-bold">Review what you missed</h3>
            {wrong.map((w) => (
              <div key={w.index} className="rounded-2xl border border-rose-500/25 bg-rose-500/5 p-4">
                <p className="font-semibold leading-snug">{w.q.question}</p>
                <p className="mt-2 flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-300"><Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> <span>{w.q.options[w.q.correct_answer]}</span></p>
                {w.q.explanation && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{w.q.explanation}</p>}
              </div>
            ))}
          </div>
        )}
        <p className="mt-8 text-center"><Link to="/mcqs" className="text-sm font-bold text-primary hover:underline">← All question banks</Link></p>
      </div>
    );
  }

  const answered = results.size;
  return (
    <div ref={top} className="mx-auto max-w-2xl px-4 pb-28 pt-6 sm:pt-8">
      <div className="flex items-center justify-between gap-3">
        <Link to="/mcqs" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden /> Banks</Link>
        <p className="truncate text-sm font-bold">{title}</p>
        <span className="shrink-0 text-sm font-bold tabular-nums text-muted-foreground">{pos + 1}/{items.length}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(answered / items.length) * 100}%` }} /></div>
      <p className="mt-2 text-xs font-semibold text-muted-foreground">{examUnit(set.category)} · {correct} correct so far</p>

      <h1 className="mt-6 font-serif text-xl font-bold leading-snug sm:text-2xl">{cur.q.question}</h1>
      <div className="mt-5 space-y-2.5" role="group" aria-label="Answer options">
        {cur.q.options.map((opt, oi) => {
          const isRight = oi === cur.q.correct_answer, isPick = picked === oi;
          const style = picked === null ? "border-border bg-card hover:border-primary/60 hover:bg-primary/5" : isRight ? "border-emerald-500 bg-emerald-500/10" : isPick ? "border-rose-500 bg-rose-500/10" : "border-border bg-card opacity-60";
          return (
            <button key={oi} type="button" disabled={picked !== null} onClick={() => pick(oi)} className={`flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left text-[15px] leading-snug transition ${style}`}>
              <span className={`mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${picked !== null && isRight ? "border-emerald-500 bg-emerald-500 text-white" : picked !== null && isPick ? "border-rose-500 bg-rose-500 text-white" : "border-border text-muted-foreground"}`}>{picked !== null && isRight ? <Check className="h-4 w-4" aria-hidden /> : picked !== null && isPick ? <X className="h-4 w-4" aria-hidden /> : LETTERS[oi]}</span>
              <span className="flex-1">{opt}</span>
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <div className="mt-5 rounded-2xl border border-border bg-muted/40 p-4">
          <p className={`text-sm font-bold ${picked === cur.q.correct_answer ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}`}>{picked === cur.q.correct_answer ? "Correct" : `Not quite. The answer is ${LETTERS[cur.q.correct_answer]}.`}</p>
          {cur.q.explanation && <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{cur.q.explanation}</p>}
          <button type="button" onClick={() => openAI(`Explain this question like I am a medical student and tell me what the examiner wants:\n${cur.q.question}\nOptions: ${cur.q.options.map((o, i) => `${LETTERS[i]}. ${o}`).join("; ")}\nCorrect answer: ${LETTERS[cur.q.correct_answer]}`)} className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline"><OmpathMark className="h-6 w-6" /> Explain this with Ompath AI</button>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">Press A–D to answer, Enter for next</span>
          <button type="button" disabled={picked === null} onClick={next} className="ml-auto inline-flex h-11 min-w-[160px] items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground transition disabled:opacity-40">{pos + 1 >= items.length ? "See my score" : "Next question"} <ArrowRight className="h-4 w-4" aria-hidden /></button>
        </div>
      </div>
    </div>
  );
}

/** /mcqs/:id : a practice bank (instant answers, nothing to register). Timed exams are handed to the exam page. */
export default function McqSet() {
  const { id } = useParams();
  const [set, setSet] = useState<McqSetRow | null | undefined>(undefined);
  useEffect(() => { let live = true; setSet(undefined); if (id) resolveMcqSet(id).then((s) => live && setSet(s)); return () => { live = false; }; }, [id]);
  if (set === undefined) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" /></div>;
  if (!set) return <Navigate to="/mcqs" replace />;
  if (isExamLike(set)) return <Navigate to={`/exams/${(set.slug || set.id)}/start`} replace />;
  return (
    <div className="min-h-screen bg-background">
      <Helmet><title>{`${shortTitle(set.title, set.category)} — MCQ practice | Ompath Study`}</title><meta name="description" content={`${set.questions.length} practice questions with explanations: ${shortTitle(set.title, set.category)}.`} /></Helmet>
      <Practice key={set.id} set={set} />
    </div>
  );
}
