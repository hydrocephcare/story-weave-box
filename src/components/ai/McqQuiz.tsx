import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, RotateCcw, X } from "lucide-react";
import UpgradeCard from "@/components/ai/UpgradeCard";
import { Answer } from "@/components/ai/AnswerText";
import { buildQuiz, type QuizBuild, type QuizQuestion } from "@/lib/mcqBank";
import { logEvents } from "@/lib/review";

const LETTERS = "ABCDEFGH";
export const FREE_QUIZ_SIZE = 10;
const topicLabel = (q: QuizQuestion) => q.category.replace(/^Weekly Exam:\s*/i, "").trim() || q.setTitle;

/**
 * A practice quiz made from the site's own MCQs. The answers stay hidden until you submit; then every question shows the right answer and
 * why, you get a score, and the ones you missed are kept so Review can point you back to them. Free accounts get up to 10 questions.
 */
export default function McqQuiz({ topic, n, year, canLong, onAgain }: { topic: string; n: number; year: number | null; canLong: boolean; onAgain: (topic: string) => void }) {
  const size = canLong ? n : Math.min(n, FREE_QUIZ_SIZE);
  const [build, setBuild] = useState<QuizBuild | null>(null);
  const [round, setRound] = useState<QuizQuestion[] | null>(null);
  const [chosen, setChosen] = useState<Record<string, number>>({});
  const [done, setDone] = useState(false);

  useEffect(() => {
    let on = true;
    void buildQuiz(topic, year, size).then((b) => { if (on) { setBuild(b); setRound(b.questions); } }, () => { if (on) { setBuild({ questions: [], sets: [], topic, wanted: size, exactYear: false }); setRound([]); } });
    return () => { on = false; };
  }, [topic, year, size]);

  const answered = useMemo(() => Object.keys(chosen).length, [chosen]);
  const score = useMemo(() => (round ?? []).filter((q) => chosen[q.id] === q.correct).length, [round, chosen]);

  if (!build || !round) return <p className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Building your quiz…</p>;
  if (!round.length) return <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">I could not find MCQs on “{topic}” on the site yet. Try a broader topic, such as the unit name.</p>;

  const submit = () => {
    setDone(true);
    logEvents(round.filter((q) => chosen[q.id] !== undefined).map((q) => ({ kind: "mcq" as const, topic: topicLabel(q), ok: chosen[q.id] === q.correct })));
  };
  const missed = round.filter((q) => chosen[q.id] !== q.correct);
  const pct = Math.round((score / round.length) * 100);

  return (
    <section className="space-y-3" aria-label="Practice quiz">
      {n > size && <UpgradeCard kind="quiz" />}
      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold">{round.length} MCQs · {topic}</p>
          {!done && <p className="text-xs font-semibold text-muted-foreground">{answered} of {round.length} answered</p>}
        </div>
        {!done && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(answered / round.length) * 100}%` }} /></div>}
        {build.questions.length < build.wanted && <p className="mt-2 text-xs text-muted-foreground">The site has {build.questions.length} good questions on this so far{build.exactYear ? "" : ", some from other years"}.</p>}
        {done && (
          <div className="mt-3 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 p-4 text-center">
            <p className="font-serif text-4xl font-bold">{score}<span className="text-xl text-muted-foreground"> / {round.length}</span></p>
            <p className="mt-1 text-sm font-semibold">{pct >= 80 ? "Strong. Keep it up." : pct >= 60 ? "Good, a little more practice." : "This is a topic worth revisiting."}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {missed.length > 0 && <button type="button" onClick={() => { setRound(missed); setChosen({}); setDone(false); }} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-bold text-primary-foreground"><RotateCcw className="h-4 w-4" /> Redo the {missed.length} I missed</button>}
              <button type="button" onClick={() => onAgain(topic)} className="rounded-lg border border-border px-3.5 py-2 text-sm font-bold hover:border-primary">A new quiz</button>
            </div>
          </div>
        )}
      </div>

      <ol className="space-y-3">
        {round.map((q, i) => (
          <li key={q.id} className="rounded-2xl border border-border bg-card p-3">
            <p className="text-sm font-semibold leading-snug"><span className="mr-1.5 text-primary">{i + 1}.</span>{q.question}</p>
            <div className="mt-2.5 grid gap-1.5" role="radiogroup" aria-label={`Question ${i + 1}`}>
              {q.options.map((o, oi) => {
                const picked = chosen[q.id] === oi;
                const right = done && oi === q.correct;
                const wrong = done && picked && oi !== q.correct;
                return (
                  <button key={oi} type="button" role="radio" aria-checked={picked} disabled={done} onClick={() => setChosen((c) => ({ ...c, [q.id]: oi }))}
                    className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${right ? "border-emerald-500 bg-emerald-500/10" : wrong ? "border-destructive bg-destructive/10" : picked ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                    <span className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${right ? "border-emerald-500 bg-emerald-500 text-white" : wrong ? "border-destructive bg-destructive text-white" : picked ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>{right ? <Check className="h-3 w-3" /> : wrong ? <X className="h-3 w-3" /> : LETTERS[oi]}</span>
                    <span className="min-w-0 flex-1 leading-snug">{o}</span>
                  </button>
                );
              })}
            </div>
            {done && q.explanation && <div className="mt-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3"><p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Why</p><Answer text={q.explanation} compact /></div>}
          </li>
        ))}
      </ol>

      {!done && (
        <div className="sticky bottom-0 -mx-1 rounded-2xl border border-border bg-background/95 p-2.5 backdrop-blur">
          <button type="button" onClick={() => { if (answered < round.length && !window.confirm(`${round.length - answered} question(s) are not answered yet. Submit anyway?`)) return; submit(); }} disabled={answered === 0} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40">Submit quiz{answered ? ` (${answered}/${round.length})` : ""}</button>
        </div>
      )}
    </section>
  );
}
