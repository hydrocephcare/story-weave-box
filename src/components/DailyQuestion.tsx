import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck } from "lucide-react";
import { todaysQuestion, type DailyQ } from "@/lib/dailyQuestion";

/** "Question of the day": one question from the notes, answered with a tap, with the reason and a link to the note it came from. */
export default function DailyQuestion({ className = "" }: { className?: string }) {
  const [q, setQ] = useState<DailyQ | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => { let on = true; void todaysQuestion().then((x) => { if (on) setQ(x); }); return () => { on = false; }; }, []);
  if (!q) return null;
  const done = picked !== null;
  return (
    <section aria-label="Question of the day" className={`rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-background to-violet-400/10 p-5 ${className}`}>
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary"><CalendarCheck className="h-4 w-4" aria-hidden /> Question of the day</p>
      <p className="mt-2 font-serif text-lg font-bold leading-snug">{q.stem}</p>
      <div className="mt-3 space-y-2">
        {q.options.map((o, i) => {
          const right = i === q.answer;
          return (
            <button key={i} type="button" disabled={done} onClick={() => setPicked(i)} className={`flex w-full gap-3 rounded-xl border px-3 py-2.5 text-left text-[15px] transition-colors ${done && right ? "border-emerald-500 bg-emerald-500/10" : done && picked === i ? "border-destructive bg-destructive/10" : "border-border bg-background hover:border-primary/60"}`}>
              <b className="shrink-0">{"ABCDE"[i]}</b><span>{o}</span>
            </button>
          );
        })}
      </div>
      {done && (
        <p className="mt-3 text-sm leading-6" role="status"><b>{picked === q.answer ? "Correct. " : `The answer is ${"ABCDE"[q.answer]}. `}</b>{q.why} <Link to={`/notes/${q.noteSlug}`} className="font-bold text-primary hover:underline">Read the note: {q.noteTitle} →</Link></p>
      )}
    </section>
  );
}
