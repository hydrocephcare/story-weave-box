import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, RotateCcw, X } from "lucide-react";
import { ALL_PDRUGS, DRUG_GROUPS } from "@/pharm";
import { drugMcq, type PharmMcq } from "@/lib/pharmDrill";
import { updateMetaTags } from "@/lib/seo";
import { recordReview } from "@/lib/deckStats";

const ROUND = 10;
const shuffle = <T,>(a: T[]): T[] => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

/** One round of drug questions from the site's own drug guide: class, mechanism, use, adverse effects and cautions, in a mix. */
function buildRound(group: string): PharmMcq[] {
  const pool = group ? ALL_PDRUGS.filter((d) => d.group === group) : ALL_PDRUGS;
  const out: PharmMcq[] = [];
  let kind = Math.floor(Math.random() * 5);
  for (const d of shuffle(pool)) {
    for (let t = 0; t < 5; t++) { const q = drugMcq(d, kind++); if (q) { out.push(q); break; } }
    if (out.length >= ROUND) break;
  }
  return out;
}

/** /pharmacology/quiz: ten drug questions at a time. A wrong answer comes back at the end of the round, so the drugs you miss are the ones you see twice. */
export default function PharmQuiz() {
  const [group, setGroup] = useState("");
  const [queue, setQueue] = useState<PharmMcq[]>(() => buildRound(""));
  const [total, setTotal] = useState(queue.length);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const [first, setFirst] = useState(0);
  const [done, setDone] = useState(false);
  const [missed, setMissed] = useState<PharmMcq[]>([]);

  useEffect(() => { updateMetaTags({ title: "Pharmacology quiz", description: "Ten drug questions at a time: class, mechanism, uses, side effects and cautions. The ones you miss come back." }); }, []);

  const start = useCallback((g: string) => {
    const q = buildRound(g);
    setGroup(g); setQueue(q); setTotal(q.length); setPicked(null); setRight(0); setFirst(0); setDone(false); setMissed([]);
  }, []);

  const q = queue[0];
  const answer = (k: number) => {
    if (picked !== null || !q) return;
    setPicked(k); recordReview();
    const ok = k === q.correct_answer;
    if (ok) setRight((n) => n + 1);
    // a question seen for the first time counts once; a miss returns later
    if (!missed.includes(q)) { setFirst((n) => n + (ok ? 1 : 0)); if (!ok) setMissed((m) => [...m, q]); }
  };
  const next = () => {
    if (!q) return;
    const wasRight = picked === q.correct_answer;
    const rest = queue.slice(1);
    const nq = wasRight ? rest : [...rest, q];
    setPicked(null);
    if (!nq.length) setDone(true); else setQueue(nq);
  };
  const groups = useMemo(() => DRUG_GROUPS.filter((g) => ALL_PDRUGS.some((d) => d.group === g)), []);

  return (
    <div className="mx-auto max-w-xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Pharmacology</p>
      <h1 className="mt-1 font-serif text-3xl font-bold sm:text-4xl">Drug quiz</h1>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Drug group">
        {["", ...groups].map((g) => <button key={g || "all"} type="button" role="tab" aria-selected={group === g} onClick={() => start(g)} className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold ${group === g ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{g || "All drugs"}</button>)}
      </div>

      {done || !q ? (
        <div className="py-12 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Round complete</p>
          <p className="mt-2 font-serif text-6xl font-bold tabular-nums">{first}<span className="text-3xl text-muted-foreground"> / {total}</span></p>
          <p className="mt-2 text-[15px] text-muted-foreground">right the first time{missed.length ? `. ${missed.length} came back and you got them in the end.` : "."}</p>
          {missed.length > 0 && (
            <ul className="mx-auto mt-6 max-w-md divide-y divide-border border-y border-border text-left">
              {missed.map((m, i) => <li key={i} className="py-3 text-[15px]"><span className="font-semibold">{m.question}</span><span className="mt-1 block text-sm text-muted-foreground">{m.explanation}</span></li>)}
            </ul>
          )}
          <div className="mt-6 flex flex-col items-center gap-2">
            <button type="button" onClick={() => start(group)} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"><RotateCcw className="h-4 w-4" /> Another round</button>
            <Link to="/pharmacology" className="px-5 py-2 text-sm font-bold text-primary hover:underline">Back to the drug guide</Link>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground"><span>{queue.length} left</span><span className="tabular-nums">{right} right so far</span></div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${total ? ((total - queue.length) / total) * 100 : 0}%` }} /></div>
          <p className="mt-6 font-serif text-[22px] font-semibold leading-snug">{q.question}</p>
          <ul className="mt-5 space-y-2">
            {q.options.map((o, k) => {
              const isRight = picked !== null && k === q.correct_answer, isWrong = picked === k && k !== q.correct_answer;
              return (
                <li key={k}>
                  <button type="button" disabled={picked !== null} onClick={() => answer(k)} className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-[16px] leading-snug transition-colors ${isRight ? "border-emerald-500/60 bg-emerald-500/10" : isWrong ? "border-destructive/50 bg-destructive/10" : "border-border hover:border-primary/50"}`}>
                    <span className="mt-0.5 font-bold text-primary">{String.fromCharCode(65 + k)}</span><span className="min-w-0 flex-1 break-words">{o}</span>
                    {isRight && <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" aria-hidden />}{isWrong && <X className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
          {picked !== null && (
            <div className="mt-4">
              <p className="text-[15px] leading-relaxed text-foreground/85">{q.explanation}</p>
              <button type="button" onClick={next} className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground">{queue.length === 1 && picked === q.correct_answer ? "Finish" : "Next"} <ArrowRight className="h-4 w-4" /></button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
