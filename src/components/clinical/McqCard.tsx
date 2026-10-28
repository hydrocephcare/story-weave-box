import { useMemo, useState } from "react";
import { CheckCircle2, CircleDashed, Lightbulb, RotateCcw, XCircle } from "lucide-react";
import { displayOrder, scoreMcq, type McqResult } from "@/clinical/engine";
import type { MCQ } from "@/clinical/types";
import { recordMcq } from "@/clinical/mistakes";

interface Props {
  q: MCQ;
  /** Called once, when the learner has finished with this question (answered or revealed). */
  onDone: (result: McqResult, hintsUsed: number) => void;
  label?: string;
}

/**
 * One consultant-style question. Hints come one at a time (small clue → almost the answer), a wrong answer can be
 * retried once, and the feedback says what was right (✓), incomplete (△) and wrong (✗), and why.
 */
export default function McqCard({ q: given, onDone, label }: Props) {
  const q = useMemo(() => displayOrder(given), [given]);   // the right answer is written first; it is shown in a fixed random place
  const [picked, setPicked] = useState<number[]>([]);
  const [hints, setHints] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<McqResult | null>(null);
  const [done, setDone] = useState(false);

  const toggle = (i: number) => { if (result && done) return; setResult(null); setPicked((p) => (q.multi ? (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]) : [i])); };
  const submit = () => {
    const r = scoreMcq(q, picked, hints, attempt > 0);
    setResult(r);
    if (r.allRight || attempt >= 1) { setDone(true); onDone(r, hints); recordMcq(q, r.allRight && attempt === 0); }
  };
  const retry = () => { setAttempt(1); setResult(null); setPicked([]); };
  const reveal = () => {
    const r = scoreMcq(q, picked, hints, true);
    setResult({ ...r, earned: 0 }); setDone(true); onDone({ ...r, earned: 0 }, hints); recordMcq(q, false);
  };

  const locked = done;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      {label && <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-primary">{label}</p>}
      <p className="text-sm font-bold leading-relaxed text-foreground sm:text-base">{q.q}</p>
      {q.multi && <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">Select all that apply.</p>}

      <ul className="mt-3 space-y-2">
        {q.options.map((opt, i) => {
          const isPicked = picked.includes(i);
          const showMark = locked || (result && !result.allRight);
          const good = result && (locked ? opt.ok : false);
          const mark = locked ? (opt.ok ? (isPicked ? "ok" : "missed") : isPicked ? "bad" : "") : result && isPicked ? (opt.ok ? "ok" : "bad") : "";
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => toggle(i)}
                disabled={locked}
                aria-pressed={isPicked}
                className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${mark === "ok" ? "border-emerald-500/60 bg-emerald-500/10" : mark === "bad" ? "border-rose-500/60 bg-rose-500/10" : mark === "missed" ? "border-amber-500/60 bg-amber-500/10" : isPicked ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
              >
                <span className="mt-0.5 shrink-0">{mark === "ok" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : mark === "bad" ? <XCircle className="h-4 w-4 text-rose-600" /> : mark === "missed" ? <CircleDashed className="h-4 w-4 text-amber-600" /> : <span className={`block h-4 w-4 ${q.multi ? "rounded" : "rounded-full"} border-2 ${isPicked ? "border-primary bg-primary" : "border-muted-foreground/40"}`} />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block leading-snug text-foreground">{opt.t}</span>
                  {(locked || (showMark && isPicked && result)) && mark && opt.why && <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{mark === "missed" ? "△ You missed this one: " : mark === "ok" ? "✓ " : "✗ "}{opt.why}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {hints > 0 && (
        <ol className="mt-3 space-y-1.5">
          {q.hints.slice(0, hints).map((h, i) => <li key={i} className="flex gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-foreground"><Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" /><span><b>Hint {i + 1}:</b> {h}</span></li>)}
        </ol>
      )}

      {result && !done && (
        <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-700">
          {result.correctPicked.length > 0 ? "△ Part of your answer is right, but it is incomplete or includes something wrong." : "✗ Not quite."} Use a hint and try again — you get one retry.
        </p>
      )}

      {done && result && (
        <div className="mt-3 rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs leading-relaxed text-foreground">
          <p className="mb-1 font-bold text-primary">{result.allRight ? "✓ Correct" : result.correctPicked.length ? "△ Partly right" : "✗ Not this time"} — the reasoning</p>
          {q.explain}
        </div>
      )}

      {!done && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!(result && !result.allRight && attempt === 0) && <button type="button" onClick={submit} disabled={!picked.length} className="rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40">Submit answer</button>}
          {result && !result.allRight && attempt === 0 && <button type="button" onClick={retry} className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-bold hover:border-primary/50"><RotateCcw className="h-3.5 w-3.5" /> Try again</button>}
          <button type="button" onClick={() => setHints((h) => Math.min(h + 1, q.hints.length))} disabled={hints >= q.hints.length} className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 px-4 py-2 text-xs font-bold text-amber-700 hover:bg-amber-500/10 disabled:opacity-40"><Lightbulb className="h-3.5 w-3.5" /> Hint {Math.min(hints + 1, q.hints.length)}/{q.hints.length}</button>
          {(hints >= 2 || attempt > 0 || result) && <button type="button" onClick={reveal} className="text-xs font-semibold text-muted-foreground underline hover:text-foreground">Show me the answer</button>}
        </div>
      )}
    </div>
  );
}
