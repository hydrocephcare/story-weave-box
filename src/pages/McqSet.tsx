import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Check, ChevronRight, Eye, EyeOff, Loader2, RotateCcw, X } from "lucide-react";
import OmpathMark from "@/components/ai/OmpathMark";
import { Helmet } from "react-helmet-async";
import { trackAnswer } from "@/lib/answer-tracker";
import { openAI } from "@/lib/aiEvents";
import { isExamLike, resolveMcqSet, type McqSetRow } from "@/lib/mcqSet";
import { examUnit, examYear, shortTitle } from "@/lib/examMeta";

const LETTERS = "ABCDEF";

/** A question bank as a reading page: every question in one scroll, each answer opens in place with its explanation. */
function Bank({ set }: { set: McqSetRow }) {
  const qs = set.questions;
  const [picked, setPicked] = useState<Map<number, number>>(new Map());
  const [shown, setShown] = useState<Set<number>>(new Set());   // answers revealed without answering
  const [only, setOnly] = useState<"all" | "missed">("all");

  const pick = useCallback((i: number, oi: number) => {
    if (picked.has(i)) return;
    setPicked((m) => new Map(m).set(i, oi));
    const q = qs[i];
    void trackAnswer({ mcq_set_id: set.id, question_index: i, question_text: q.question, selected_answer: oi, correct_answer: q.correct_answer, is_correct: oi === q.correct_answer }).catch(() => {});
  }, [picked, qs, set.id]);

  const answered = picked.size;
  const correct = [...picked].filter(([i, oi]) => qs[i].correct_answer === oi).length;
  const missed = [...picked].filter(([i, oi]) => qs[i].correct_answer !== oi).map(([i]) => i);
  const pct = answered ? Math.round((correct / answered) * 100) : 0;
  const finished = answered === qs.length;
  useEffect(() => {
    if (!finished) return;
    try { localStorage.setItem(`mcq_practice_${set.id}`, JSON.stringify({ score: correct, total: qs.length, at: Date.now() })); } catch { /* storage blocked */ }
  }, [finished, correct, qs.length, set.id]);

  const reset = () => { setPicked(new Map()); setShown(new Set()); setOnly("all"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const indices = qs.map((_, i) => i).filter((i) => only === "all" || missed.includes(i));
  const unit = examUnit(set.category), year = examYear(set.category, set.title), title = shortTitle(set.title, set.category);
  const toggleShow = (i: number) => setShown((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:pt-8">
      <nav className="flex flex-wrap items-center gap-1 text-sm font-semibold text-muted-foreground" aria-label="Breadcrumb">
        <Link to="/mcqs" className="hover:text-foreground">MCQ Library</Link>
        {year && <><ChevronRight className="h-3.5 w-3.5" aria-hidden /><Link to={`/mcqs?year=Year ${year}`} className="hover:text-foreground">Year {year}</Link></>}
        <ChevronRight className="h-3.5 w-3.5" aria-hidden /><Link to={`/mcqs?${year ? `year=Year ${year}&` : ""}unit=${encodeURIComponent(unit)}`} className="hover:text-foreground">{unit}</Link>
      </nav>
      <h1 className="mt-3 font-serif text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">{qs.length} questions · choose an answer to see the explanation · nothing is timed</p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-baseline justify-between"><p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Progress</p><p className="text-sm font-bold tabular-nums">{answered}/{qs.length}</p></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(answered / qs.length) * 100}%` }} /></div>
            <p className="mt-2 text-sm text-muted-foreground">{answered ? <><strong className={pct >= 60 ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300"}>{pct}%</strong> correct so far</> : "Not started"}</p>
            <div className="mt-4 grid grid-cols-8 gap-1 lg:grid-cols-5">
              {qs.map((q, i) => {
                const a = picked.get(i);
                const cls = a === undefined ? "border-border text-muted-foreground hover:border-primary/60" : a === q.correct_answer ? "border-emerald-500 bg-emerald-500 text-white" : "border-rose-500 bg-rose-500 text-white";
                return <a key={i} href={`#q${i + 1}`} className={`flex h-8 items-center justify-center rounded-md border text-xs font-bold ${cls}`}>{i + 1}</a>;
              })}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setShown(shown.size === qs.length ? new Set() : new Set(qs.map((_, i) => i)))} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-2 text-xs font-bold hover:bg-muted">{shown.size === qs.length ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />} {shown.size === qs.length ? "Hide" : "Reveal all"}</button>
              <button type="button" onClick={reset} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-2 text-xs font-bold hover:bg-muted"><RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset</button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 space-y-5">
          {missed.length > 0 && (
            <div className="flex gap-2" role="group" aria-label="Show">
              {(["all", "missed"] as const).map((k) => <button key={k} type="button" aria-pressed={only === k} onClick={() => setOnly(k)} className={`rounded-full px-4 py-1.5 text-sm font-bold ${only === k ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{k === "all" ? "All questions" : `Missed (${missed.length})`}</button>)}
            </div>
          )}
          {indices.map((i) => {
            const q = qs[i]; const a = picked.get(i); const open = a !== undefined || shown.has(i);
            return (
              <article key={i} id={`q${i + 1}`} className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-6">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Question {i + 1}</p>
                <h2 className="mt-1.5 font-serif text-lg font-bold leading-snug sm:text-xl">{q.question}</h2>
                <div className="mt-4 space-y-2" role="group" aria-label={`Options for question ${i + 1}`}>
                  {q.options.map((opt, oi) => {
                    const right = oi === q.correct_answer, mine = a === oi;
                    const style = !open ? "border-border hover:border-primary/60 hover:bg-primary/5" : right ? "border-emerald-500 bg-emerald-500/10" : mine ? "border-rose-500 bg-rose-500/10" : "border-border opacity-60";
                    return (
                      <button key={oi} type="button" disabled={open} onClick={() => pick(i, oi)} className={`flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left text-[15px] leading-snug transition ${style}`}>
                        <span className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${open && right ? "border-emerald-500 bg-emerald-500 text-white" : open && mine ? "border-rose-500 bg-rose-500 text-white" : "border-border text-muted-foreground"}`}>{open && right ? <Check className="h-3.5 w-3.5" aria-hidden /> : open && mine ? <X className="h-3.5 w-3.5" aria-hidden /> : LETTERS[oi]}</span>
                        <span className="flex-1">{opt}</span>
                      </button>
                    );
                  })}
                </div>
                {!open ? (
                  <button type="button" onClick={() => toggleShow(i)} className="mt-3 text-sm font-bold text-muted-foreground hover:text-foreground">Show answer</button>
                ) : (
                  <div className="mt-4 rounded-xl border-l-4 border-primary bg-muted/40 px-4 py-3">
                    <p className={`text-sm font-bold ${a === undefined ? "text-foreground" : a === q.correct_answer ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}`}>{a === undefined ? `Answer: ${LETTERS[q.correct_answer]}` : a === q.correct_answer ? "Correct" : `Not quite. The answer is ${LETTERS[q.correct_answer]}.`}</p>
                    {q.explanation && <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{q.explanation}</p>}
                    <button type="button" onClick={() => openAI(`Explain this question like I am a medical student and tell me what the examiner wants:\n${q.question}\nOptions: ${q.options.map((o, k) => `${LETTERS[k]}. ${o}`).join("; ")}\nCorrect answer: ${LETTERS[q.correct_answer]}`)} className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline"><OmpathMark className="h-6 w-6" /> Explain with Ompath AI</button>
                  </div>
                )}
              </article>
            );
          })}

          {finished && (
            <section className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Bank complete</p>
              <p className="mt-1 font-serif text-3xl font-bold tabular-nums">{correct} / {qs.length} <span className="text-lg text-muted-foreground">({Math.round((correct / qs.length) * 100)}%)</span></p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {missed.length > 0 && <button type="button" onClick={() => { setOnly("missed"); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Review the {missed.length} I missed</button>}
                <button type="button" onClick={reset} className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold hover:bg-muted">Start again</button>
                <Link to={`/mcqs?${year ? `year=Year ${year}&` : ""}unit=${encodeURIComponent(unit)}`} className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold hover:bg-muted">More in {unit}</Link>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/** /mcqs/:id : a practice bank. Timed exams are handed to the exam page. */
export default function McqSet() {
  const { id } = useParams();
  const [set, setSet] = useState<McqSetRow | null | undefined>(undefined);
  useEffect(() => { let live = true; setSet(undefined); if (id) resolveMcqSet(id).then((s) => live && setSet(s)); return () => { live = false; }; }, [id]);
  const title = useMemo(() => (set ? shortTitle(set.title, set.category) : ""), [set]);
  if (set === undefined) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" /></div>;
  if (!set) return <Navigate to="/mcqs" replace />;
  if (isExamLike(set)) return <Navigate to={`/exams/${(set.slug || set.id)}/start`} replace />;
  return (
    <div className="min-h-screen bg-background">
      <Helmet><title>{`${title} — MCQs with answers | Ompath Study`}</title><meta name="description" content={`${set.questions.length} practice questions with explanations: ${title}.`} /></Helmet>
      <Bank key={set.id} set={set} />
    </div>
  );
}
