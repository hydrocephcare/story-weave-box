import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import DentalAnswer from "@/components/dental/DentalAnswer";

interface Q { n: number; text: string; marks: number | null; answer: string }
const FAIL = "Could not write one just now. Try again in a minute.";

/** A practice paper in the style of this one, written by AI once per paper and kept. Clearly labelled as practice, not a past paper. */
export default function DentalSimilar({ open, onOpenChange, slug, unit }: { open: boolean; onOpenChange: (v: boolean) => void; slug: string; unit: string }) {
  const [qs, setQs] = useState<Q[] | null>(null);
  const [err, setErr] = useState("");
  const [shown, setShown] = useState<Set<number>>(new Set());
  useEffect(() => { setQs(null); setErr(""); setShown(new Set()); }, [slug]);
  useEffect(() => {
    if (!open || qs) return;
    let on = true; setErr("");
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("paper-similar", { body: { slug } });
        if (!on) return;
        if (error || !data?.questions) setErr(FAIL); else setQs(data.questions as Q[]);
      } catch { if (on) setErr(FAIL); }
    })();
    return () => { on = false; };
  }, [open, qs, slug]);
  const toggle = (n: number) => setShown((p) => { const x = new Set(p); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex h-[94dvh] flex-col gap-0 rounded-t-3xl p-0">
        <SheetTitle className="sr-only">Practice paper</SheetTitle>
        <SheetDescription className="sr-only">New practice questions in the style of this past paper.</SheetDescription>
        <div className="shrink-0 px-5 pb-3 pt-5 pr-14"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Practice paper · {unit}</p><p className="mt-1 text-sm text-muted-foreground">New questions in the style of this paper, written by AI. Not an official past paper: use them to test yourself.</p></div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10">
          {!qs && !err && <p className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Writing your practice paper. This takes about half a minute the first time.</p>}
          {err && <p className="py-10 text-amber-600">{err}</p>}
          {qs && <ol className="divide-y divide-border border-y border-border">{qs.map((q) => (
            <li key={q.n} className="py-4">
              <div className="flex items-baseline justify-between gap-3"><p className="min-w-0 flex-1 whitespace-pre-line text-[17px] leading-relaxed"><span className="mr-2 font-serif text-lg font-bold text-primary">{q.n}.</span>{q.text}</p>{q.marks ? <span className="shrink-0 text-sm font-semibold text-muted-foreground">{q.marks} marks</span> : null}</div>
              <button type="button" onClick={() => toggle(q.n)} aria-expanded={shown.has(q.n)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">{shown.has(q.n) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{shown.has(q.n) ? "Hide answer" : "Show answer"}</button>
              {shown.has(q.n) && <DentalAnswer text={q.answer} />}
            </li>))}</ol>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
