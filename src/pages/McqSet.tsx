import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ChevronRight, Eye, EyeOff, Loader2, RotateCcw } from "lucide-react";
import OmpathMark from "@/components/ai/OmpathMark";
import { Helmet } from "react-helmet-async";
import { trackAnswer } from "@/lib/answer-tracker";
import { openAI } from "@/lib/aiEvents";
import { isExamLike, resolveMcqSet, shuffleOptions, type McqSetRow } from "@/lib/mcqSet";
import { examUnit, examYear, shortTitle } from "@/lib/examMeta";

const LETTERS = "ABCDEF";
const mixOrder = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

/**
 * A question bank as a reading page. A wrong choice is marked and you may try again; the answer opens when you get it right or tap "Show answer".
 * Your score counts the first try only, so retrying teaches without inflating it.
 */
function Bank({ set }: { set: McqSetRow }) {
  const [qs, setQs] = useState(set.questions);   // Reset mixes the questions and their options again, so positions cannot be memorised
  const [first, setFirst] = useState<Map<number, number>>(new Map());          // the first choice made on each question (this is what is scored)
  const [wrong, setWrong] = useState<Map<number, number[]>>(new Map());        // wrong choices already tried, per question
  const [solved, setSolved] = useState<Set<number>>(new Set());               // answered correctly (on any try)
  const [shown, setShown] = useState<Set<number>>(new Set());                 // answer revealed without solving
  const [only, setOnly] = useState<"all" | "missed">("all");

  const pick = useCallback((i: number, oi: number) => {
    if (solved.has(i) || shown.has(i) || (wrong.get(i) ?? []).includes(oi)) return;
    const q = qs[i];
    if (!first.has(i)) {
      setFirst((m) => new Map(m).set(i, oi));
      void trackAnswer({ mcq_set_id: set.id, question_index: i, question_text: q.question, selected_answer: oi, correct_answer: q.correct_answer, is_correct: oi === q.correct_answer }).catch(() => {});
    }
    if (oi === q.correct_answer) setSolved((s) => new Set(s).add(i));
    else setWrong((m) => new Map(m).set(i, [...(m.get(i) ?? []), oi]));
  }, [solved, shown, wrong, first, qs, set.id]);

  const done = new Set([...solved, ...shown]);
  const answered = done.size;
  const correct = [...first].filter(([i, oi]) => qs[i].correct_answer === oi).length;
  const missed = qs.map((_, i) => i).filter((i) => done.has(i) && !(first.get(i) !== undefined && first.get(i) === qs[i].correct_answer));
  const tried = first.size;
  const pct = tried ? Math.round((correct / tried) * 100) : 0;
  const finished = answered === qs.length;
  useEffect(() => {
    if (!finished) return;
    try { localStorage.setItem(`mcq_practice_${set.id}`, JSON.stringify({ score: correct, total: qs.length, at: Date.now() })); } catch { /* storage blocked */ }
  }, [finished, correct, qs.length, set.id]);

  const reset = () => { setQs((cur) => shuffleOptions(mixOrder(cur), String(Math.random()))); setFirst(new Map()); setWrong(new Map()); setSolved(new Set()); setShown(new Set()); setOnly("all"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const indices = qs.map((_, i) => i).filter((i) => only === "all" || missed.includes(i));
  const unit = examUnit(set.category), year = examYear(set.category, set.title), title = shortTitle(set.title, set.category);
  const reveal = (i: number) => setShown((s) => new Set(s).add(i));
  const allShown = shown.size === qs.length;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:pt-8">
      <nav className="flex flex-wrap items-center gap-1 text-sm font-semibold text-muted-foreground" aria-label="Breadcrumb">
        <Link to="/mcqs" className="hover:text-foreground">MCQ Library</Link>
        {year && <><ChevronRight className="h-3.5 w-3.5" aria-hidden /><Link to={`/mcqs?year=Year ${year}`} className="hover:text-foreground">Year {year}</Link></>}
        <ChevronRight className="h-3.5 w-3.5" aria-hidden /><Link to={`/mcqs?${year ? `year=Year ${year}&` : ""}unit=${encodeURIComponent(unit)}`} className="hover:text-foreground">{unit}</Link>
      </nav>
      <h1 className="mt-3 font-serif text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">{qs.length} questions · pick an answer; if it is wrong you can try again · nothing is timed</p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[200px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="flex items-baseline justify-between"><p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Progress</p><p className="text-sm font-bold tabular-nums">{answered}/{qs.length}</p></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(answered / qs.length) * 100}%` }} /></div>
          <p className="mt-2 text-sm text-muted-foreground">{tried ? <><strong className={pct >= 60 ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300"}>{pct}%</strong> right first time</> : "Not started"}</p>
          <div className="mt-3 grid grid-cols-8 gap-1 lg:grid-cols-5">
            {qs.map((q, i) => {
              const f = first.get(i);
              const cls = !done.has(i) ? ((wrong.get(i) ?? []).length ? "text-rose-500" : "text-muted-foreground hover:text-foreground") : f === q.correct_answer ? "bg-emerald-500 text-white" : "bg-rose-500 text-white";
              return <a key={i} href={`#q${i + 1}`} className={`flex h-8 items-center justify-center rounded-md text-xs font-bold ${cls}`}>{i + 1}</a>;
            })}
          </div>
          <div className="mt-4 flex gap-4 text-xs font-bold">
            <button type="button" onClick={() => setShown(allShown ? new Set() : new Set(qs.map((_, i) => i)))} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">{allShown ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />} {allShown ? "Hide all" : "Reveal all"}</button>
            <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"><RotateCcw className="h-3.5 w-3.5" aria-hidden /> Start over</button>
          </div>
        </aside>

        <div className="min-w-0">
          {missed.length > 0 && (
            <div className="mb-4 flex gap-4 text-sm font-bold" role="group" aria-label="Show">
              {(["all", "missed"] as const).map((k) => <button key={k} type="button" aria-pressed={only === k} onClick={() => setOnly(k)} className={only === k ? "text-primary underline underline-offset-4" : "text-muted-foreground hover:text-foreground"}>{k === "all" ? "All questions" : `Missed first time (${missed.length})`}</button>)}
            </div>
          )}
          {indices.map((i) => {
            const q = qs[i]; const tries = wrong.get(i) ?? []; const open = solved.has(i) || shown.has(i);
            return (
              <article key={i} id={`q${i + 1}`} className="scroll-mt-24 border-t border-border py-6 first:border-t-0 first:pt-0">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Question {i + 1}</p>
                <h2 className="mt-1.5 font-serif text-lg font-bold leading-snug sm:text-xl">{q.question}</h2>
                <div className="mt-3 space-y-1" role="group" aria-label={`Options for question ${i + 1}`}>
                  {q.options.map((opt, oi) => {
                    const right = oi === q.correct_answer, was = tries.includes(oi);
                    const style = open ? (right ? "bg-emerald-500/10" : was ? "bg-rose-500/10 text-muted-foreground" : "text-muted-foreground") : was ? "bg-rose-500/10 text-muted-foreground line-through decoration-rose-500/50" : "hover:bg-primary/5";
                    return (
                      <button key={oi} type="button" disabled={open || was} onClick={() => pick(i, oi)} aria-label={`Option ${LETTERS[oi]}: ${opt}${was ? " (not correct)" : ""}`} className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] leading-snug transition-colors ${style}`}>
                        <span className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${open && right ? "bg-emerald-500 text-white" : was ? "bg-rose-500 text-white" : "bg-muted text-muted-foreground"}`}>{LETTERS[oi]}</span>
                        <span className="flex-1">{opt}</span>
                      </button>
                    );
                  })}
                </div>
                {!open ? (
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-3 text-sm">
                    {tries.length > 0 && <span className="font-semibold text-rose-600 dark:text-rose-300">Not quite. Try again.</span>}
                    <button type="button" onClick={() => reveal(i)} className="font-bold text-muted-foreground hover:text-foreground">Show answer</button>
                  </div>
                ) : (
                  <div className="mt-3 border-l-[3px] border-primary/60 px-4 py-1">
                    <p className={`text-sm font-bold ${first.get(i) === q.correct_answer ? "text-emerald-600 dark:text-emerald-300" : "text-foreground"}`}>{first.get(i) === q.correct_answer ? "Correct first time." : solved.has(i) ? `Correct${tries.length ? ` after ${tries.length} ${tries.length === 1 ? "try" : "tries"}` : ""}.` : "Answer revealed."} The answer is {LETTERS[q.correct_answer]}.</p>
                    {q.explanation && <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{q.explanation}</p>}
                    <button type="button" onClick={() => openAI(`Explain this question like I am a medical student and tell me what the examiner wants:\n${q.question}\nOptions: ${q.options.map((o, k) => `${LETTERS[k]}. ${o}`).join(" | ")}\nAnswer: ${LETTERS[q.correct_answer]}`)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"><OmpathMark className="h-4 w-4" /> Explain this with Ompath AI</button>
                  </div>
                )}
              </article>
            );
          })}

          {finished && (
            <section className="border-t border-border pt-8 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Bank complete</p>
              <p className="mt-1 font-serif text-3xl font-bold tabular-nums">{correct} / {qs.length} <span className="text-lg text-muted-foreground">({Math.round((correct / qs.length) * 100)}% first time)</span></p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {missed.length > 0 && <button type="button" onClick={() => { setOnly("missed"); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Review the {missed.length} I missed</button>}
                <button type="button" onClick={reset} className="rounded-full px-5 py-2.5 text-sm font-bold text-primary hover:underline">Start again</button>
                <Link to={`/mcqs?${year ? `year=Year ${year}&` : ""}unit=${encodeURIComponent(unit)}`} className="rounded-full px-5 py-2.5 text-sm font-bold text-primary hover:underline">More in {unit}</Link>
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
