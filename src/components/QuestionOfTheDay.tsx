import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildMcqPath } from "@/lib/store";
import { useScopedYear } from "@/hooks/useMyYear";
import { weakness } from "../../supabase/functions/_shared/mcqHarden.js";

interface Q { question: string; options: string[]; correct_answer: number; explanation?: string; h?: number }
interface Pick { q: Q; path: string; title: string }

/** One hard question a day on the home page, the same for everyone in the same year: answer it right there, see why, and go on to the whole bank. */
export default function QuestionOfTheDay({ className = "" }: { className?: string }) {
  const { year } = useScopedYear();
  const [pick, setPick] = useState<Pick | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);

  useEffect(() => {
    let on = true;
    void (async () => {
      try {
        const day = Math.floor((Date.now() + 3 * 3_600_000) / 86_400_000);
        let idq = (supabase as any).from("mcq_sets").select("id").eq("published", true).is("deleted_at", null).eq("source_type", "note_generated").order("id", { ascending: true }).limit(700);
        if (year) idq = idq.like("category", `Year ${year}:%`);
        const { data: ids } = await idq;
        const list: { id: string }[] = ids ?? []; if (!list.length) return;
        // a few tries, so a bank with nothing suitable does not leave the home page without a question
        for (let t = 0; t < 5; t++) {
          const id = list[(day * 31 + t * 7) % list.length].id;
          const { data } = await (supabase as any).from("mcq_sets").select("id,title,slug,questions").eq("id", id).maybeSingle();
          const set = data; if (!set || !Array.isArray(set.questions)) continue;
          const ok: Q[] = (set.questions as Q[]).filter((x) => x?.question && Array.isArray(x.options) && x.options.length === 4 && Number.isInteger(x.correct_answer) && !/!\[|figure|image|shown/i.test(x.question) && !weakness(x).filter((w: string) => w !== "recall").length);
          if (ok.length) { const q = ok[(day * 13) % ok.length]; if (on) setPick({ q, path: buildMcqPath(set), title: String(set.title).replace(/:?\s*MCQs?$/i, "") }); return; }
        }
      } catch { /* the home page does without it */ }
    })();
    return () => { on = false; };
  }, [year]);

  if (!pick) return null;
  const { q } = pick;
  return (
    <section className={className} aria-label="Question of the day">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Question of the day</p>
      <p className="mt-2 text-[17px] font-semibold leading-snug">{q.question}</p>
      <ul className="mt-3 space-y-1.5">
        {q.options.map((o, k) => {
          const right = chosen !== null && k === q.correct_answer, wrong = chosen === k && k !== q.correct_answer;
          return (
            <li key={k}>
              <button type="button" disabled={chosen !== null} onClick={() => setChosen(k)} className={`flex w-full items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-[15px] leading-snug ${right ? "border-emerald-500/60 bg-emerald-500/10" : wrong ? "border-destructive/50 bg-destructive/10" : "border-border hover:border-primary/50"}`}>
                <span className="font-bold text-primary">{String.fromCharCode(65 + k)}</span><span className="min-w-0 flex-1 break-words">{o}</span>
                {right && <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />}{wrong && <X className="h-4 w-4 shrink-0 text-destructive" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
      {chosen !== null && (
        <div className="mt-3">
          {q.explanation && <p className="text-[14px] leading-relaxed text-foreground/80">{q.explanation}</p>}
          <Link to={pick.path} className="mt-2 inline-block text-sm font-bold text-primary hover:underline">More questions on {pick.title} →</Link>
        </div>
      )}
    </section>
  );
}
