import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { trackAnswer } from "@/lib/answer-tracker";

export type QItem = { key: string; setId: string; idx: number; question: string; options: string[]; correct: number; explanation?: string; category?: string };

/** One question at a time with instant feedback and an explanation. Used by Smart practice and Challenge a friend. */
export default function QuizRunner({ items, track = true, onDone, onScore }: { items: QItem[]; track?: boolean; onDone?: (score: number, wrong: QItem[]) => void; onScore?: (score: number) => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [wrong, setWrong] = useState<QItem[]>([]);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const q = items[i];
  const letters = "ABCDEFGH";

  useEffect(() => { onScore?.(score); }, [score]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { top.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [i]);

  const choose = (n: number) => {
    if (picked !== null || !q) return;
    setPicked(n);
    const ok = n === q.correct;
    if (ok) setScore((s) => s + 1); else setWrong((w) => [...w, q]);
    if (track) void trackAnswer({ mcq_set_id: q.setId, question_index: q.idx, question_text: q.question, selected_answer: n, correct_answer: q.correct, is_correct: ok }).catch(() => {});
  };
  const next = () => {
    if (i + 1 >= items.length) { setDone(true); onDone?.(score, wrong); return; }
    setI(i + 1); setPicked(null);
  };
  const pct = useMemo(() => Math.round(((i + (picked !== null ? 1 : 0)) / Math.max(1, items.length)) * 100), [i, picked, items.length]);

  if (done) return null;
  if (!q) return null;
  return (
    <div ref={top} className="scroll-mt-20">
      <div className="mb-3 flex items-center justify-between text-sm font-semibold">
        <span>Question {i + 1} of {items.length}</span>
        <span className="text-primary">{score} correct</span>
      </div>
      <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        {q.category && <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{q.category}</p>}
        <p className="mt-1 text-[17px] font-semibold leading-snug sm:text-lg">{q.question}</p>
        <ul className="mt-4 space-y-2">
          {q.options.map((o, n) => {
            const right = picked !== null && n === q.correct, bad = picked === n && n !== q.correct;
            return (
              <li key={n}>
                <button type="button" onClick={() => choose(n)} disabled={picked !== null}
                  className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left text-[15px] leading-snug transition-colors ${right ? "border-emerald-500/60 bg-emerald-500/10" : bad ? "border-rose-500/60 bg-rose-500/10" : "border-border hover:border-primary/50 hover:bg-muted/50"} disabled:cursor-default`}>
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${right ? "border-emerald-600 bg-emerald-600 text-white" : bad ? "border-rose-600 bg-rose-600 text-white" : "border-border"}`}>
                    {right ? <Check className="h-3.5 w-3.5" aria-label="Correct" /> : bad ? <X className="h-3.5 w-3.5" aria-label="Your answer" /> : letters[n]}
                  </span>
                  <span>{o}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {picked !== null && q.explanation && <p className="mt-4 rounded-lg bg-primary/5 p-3 text-sm leading-relaxed"><strong>Why:</strong> {q.explanation}</p>}
        {picked !== null && (
          <button type="button" onClick={next} className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:opacity-90 sm:w-auto">
            {i + 1 >= items.length ? "See my result" : "Next question"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Turn a stored question set into runnable items (only real multiple-choice questions). */
export function toItems(setId: string, category: string | undefined, questions: unknown): QItem[] {
  if (!Array.isArray(questions)) return [];
  const out: QItem[] = [];
  questions.forEach((raw, idx) => {
    const q = raw as { question?: string; options?: string[]; correct_answer?: number; explanation?: string; type?: string };
    if (q?.question && Array.isArray(q.options) && q.options.length >= 2 && typeof q.correct_answer === "number" && q.correct_answer >= 0 && q.correct_answer < q.options.length && (!q.type || q.type === "mcq")) {
      out.push({ key: `${setId}:${idx}`, setId, idx, question: String(q.question), options: q.options.map(String), correct: q.correct_answer, explanation: q.explanation ? String(q.explanation) : undefined, category });
    }
  });
  return out;
}
