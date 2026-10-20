import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import DentalAnswer from "@/components/dental/DentalAnswer";

interface Row { question: string; answer: string; marks: number | null }
const show = (q: string) => q.replace(/\n?ANSWER THIS PART ONLY:\s*/g, " ").replace(/^Question \d*:\s*/, "").replace(/\s+/g, " ").trim();
const pick = <T,>(a: T[], n: number) => [...a].sort(() => Math.random() - 0.5).slice(0, n);

/** A mock exam for a unit: questions drawn at random from all of its past papers, answers hidden until you tap. Only questions that already have a model answer are drawn. */
export default function DentalMock({ open, onOpenChange, unit }: { open: boolean; onOpenChange: (v: boolean) => void; unit: string }) {
  const [pool, setPool] = useState<Row[] | null>(null);
  const [set, setSet] = useState<Row[]>([]);
  const [shown, setShown] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!open || pool) return;
    let on = true;
    void (async () => {
      try {
        const { data } = await (supabase as any).from("paper_answers").select("question, answer, marks").eq("unit", unit).not("answer", "is", null).limit(400);
        if (!on) return; const rows = (data ?? []) as Row[]; setPool(rows); setSet(pick(rows, 8));
      } catch { if (on) setPool([]); }
    })();
    return () => { on = false; };
  }, [open, pool, unit]);
  const again = () => { setSet(pick(pool ?? [], 8)); setShown(new Set()); };
  const toggle = (i: number) => setShown((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex h-[94dvh] flex-col gap-0 rounded-t-3xl p-0">
        <SheetTitle className="sr-only">Mock exam</SheetTitle>
        <SheetDescription className="sr-only">Random questions from the past papers of this unit.</SheetDescription>
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-5 pr-14"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Mock exam · {unit}</p><p className="mt-1 text-sm text-muted-foreground">Eight questions drawn from every past paper of this unit. Answer on paper first, then check.</p></div>{pool && pool.length > 0 && <button type="button" onClick={again} className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-primary"><RefreshCw className="h-4 w-4" />New set</button>}</div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10">
          {!pool && <p className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Setting your mock exam…</p>}
          {pool && pool.length === 0 && <p className="py-10 text-muted-foreground">Model answers for this unit are still being written, so there is nothing to draw from yet. Check back soon.</p>}
          {set.length > 0 && <ol className="divide-y divide-border border-y border-border">{set.map((r, i) => (
            <li key={i} className="py-4">
              <div className="flex items-baseline justify-between gap-3"><p className="min-w-0 flex-1 text-[17px] leading-relaxed"><span className="mr-2 font-serif text-lg font-bold text-primary">{i + 1}.</span>{show(r.question)}</p>{r.marks ? <span className="shrink-0 text-sm font-semibold text-muted-foreground">{r.marks} marks</span> : null}</div>
              <button type="button" onClick={() => toggle(i)} aria-expanded={shown.has(i)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">{shown.has(i) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{shown.has(i) ? "Hide answer" : "Show answer"}</button>
              {shown.has(i) && <DentalAnswer text={r.answer} />}
            </li>))}</ol>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
