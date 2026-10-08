import { useEffect, useRef, useState } from "react";
import { BookOpen, Loader2, RotateCcw } from "lucide-react";
import McqSeries, { ResultCard, type SeriesResult } from "@/components/clinical/McqSeries";
import UpgradeCard from "@/components/ai/UpgradeCard";
import type { MCQ } from "@/clinical/types";
import { drugQuestions } from "@/clinical/grading";
import { buildQuiz, type QuizBuild, type QuizQuestion } from "@/lib/mcqBank";
import { findDrug } from "@/lib/ompathAiPharm";
import { reportAiFailure } from "@/lib/aiHealth";
import { logEvents } from "@/lib/review";

export const FREE_QUIZ_SIZE = 10;
const topicLabel = (q: QuizQuestion) => q.category.replace(/^Weekly Exam:\s*/i, "").trim() || q.setTitle;

/** A site MCQ in the same shape as the Year 4 clinical questions, so it is shown the same way: hints, one retry, and the reasoning. */
export function toClinicalMcq(q: QuizQuestion): MCQ {
  const right = q.options[q.correct];
  const firstWrong = q.options.find((_, i) => i !== q.correct);
  return {
    id: q.id, skill: "pathophysiology", q: q.question,
    options: q.options.map((t, i) => ({ t, ok: i === q.correct, why: "" })),
    hints: [`This comes from ${topicLabel(q)}.`, firstWrong ? `It is not “${firstWrong.slice(0, 70)}”.` : "Rule out the options that do not fit the question.", `The answer starts with “${right.slice(0, 14)}…”.`],
    explain: q.explanation?.trim() || `The answer is: ${right}.`,
  };
}

interface Round { qs: MCQ[]; topics: string[]; note: string }

async function makeRound(topic: string, year: number | null, size: number): Promise<Round> {
  const drug = findDrug(topic);
  const own = drug ? drugQuestions(drug) : []; // a drug quiz starts with the five drug questions from the pharmacology library
  const built: QuizBuild = await buildQuiz(topic, year, Math.max(0, size - own.length)).catch(() => ({ questions: [], sets: [], topic, wanted: size, exactYear: false }));
  const site = built.questions.map(toClinicalMcq);
  const qs = [...own.slice(0, size), ...site].slice(0, size);
  const topics = [...new Set(built.questions.map(topicLabel))].slice(0, 4);
  const note = qs.length < size ? `The site has ${qs.length} good questions on this so far${built.exactYear ? "" : ", some from other years"}.` : "";
  return { qs, topics, note };
}

/**
 * A practice quiz made from the site's own MCQs, shown the way the Year 4 clinical questions are: one question at a time, hints,
 * one retry, and the reasoning once you have answered. Answers stay hidden until you submit. Free accounts get up to 10 questions.
 */
export default function McqQuiz({ topic, n, year, canLong, onAgain, onRead }: { topic: string; n: number; year: number | null; canLong: boolean; onAgain: (topic: string) => void; onRead: (topic: string) => void }) {
  const size = canLong ? n : Math.min(n, FREE_QUIZ_SIZE);
  const [round, setRound] = useState<Round | null>(null);
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<SeriesResult | null>(null);
  const missedIds = useRef<Map<string, MCQ>>(new Map());

  useEffect(() => {
    let on = true;
    void makeRound(topic, year, size).then((r) => { if (on) setRound(r); }, (e) => { void reportAiFailure("quiz", topic, e, "Empty quiz message"); if (on) setRound({ qs: [], topics: [], note: "" }); });
    return () => { on = false; };
  }, [topic, year, size]);

  if (!round) return <p className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Building your quiz…</p>;
  if (!round.qs.length) {
    return (
      <div className="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
        <p className="text-muted-foreground">I could not find MCQs on “{topic}” on the site yet. Try the unit name, or read the notes instead.</p>
        <button type="button" onClick={() => onRead(topic)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-bold text-primary-foreground"><BookOpen className="h-4 w-4" /> Notes on {topic}</button>
      </div>
    );
  }

  const start = (qs: MCQ[]) => { missedIds.current = new Map(); setRound({ ...round, qs }); setResult(null); setRun((r) => r + 1); };
  const missed = [...missedIds.current.values()];

  return (
    <section className="space-y-3" aria-label="Practice quiz">
      {n > size && <UpgradeCard kind="quiz" />}
      <div className="rounded-2xl border border-border bg-card px-4 py-3">
        <p className="text-sm font-bold">{round.qs.length} MCQs · {topic}</p>
        {round.note && <p className="mt-0.5 text-xs text-muted-foreground">{round.note}</p>}
        {!result && <p className="mt-0.5 text-xs text-muted-foreground">One at a time. Use a hint if you are stuck; the reasoning shows once you have answered.</p>}
      </div>

      {!result ? (
        <McqSeries
          key={run} qs={round.qs} finishLabel="See my score"
          onEach={(q, r) => {
            logEvents([{ kind: "mcq", topic: q.id.startsWith("dr-") ? `Pharmacology: ${topic}` : topic, ok: r.allRight }]);
            if (!r.allRight) missedIds.current.set(q.id, q);
          }}
          onFinish={setResult}
        />
      ) : (
        <>
          <ResultCard title="Quiz complete" pct={result.pct}>
            <p className="mt-1 text-sm font-semibold">{result.pct >= 80 ? "Strong. Keep it up." : result.pct >= 60 ? "Good, a little more practice." : "This is a topic worth revisiting."}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{round.qs.length - missed.length} of {round.qs.length} right first time{result.hints ? ` · ${result.hints} hint${result.hints === 1 ? "" : "s"} used` : ""}.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {missed.length > 0 && <button type="button" onClick={() => start(missed)} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"><RotateCcw className="h-4 w-4" /> Redo the {missed.length} I missed</button>}
              <button type="button" onClick={() => onRead(topic)} className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-bold hover:border-primary"><BookOpen className="h-4 w-4" /> Read the notes</button>
              <button type="button" onClick={() => onAgain(topic)} className="rounded-full border border-border px-4 py-2 text-sm font-bold hover:border-primary">A new quiz</button>
            </div>
            {missed.length > 0 && round.topics.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Questions came from: {round.topics.join(" · ")}</p>}
          </ResultCard>
        </>
      )}
    </section>
  );
}
