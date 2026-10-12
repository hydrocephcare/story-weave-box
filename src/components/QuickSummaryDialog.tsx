import { useState } from "react";
import { BookOpen, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { QuickSummary } from "@/data/quickSummaries";

/** A tappable card at the top of a note that opens a short, plain-language summary. */
export default function QuickSummaryDialog({ summary }: { summary: QuickSummary }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-5 print:hidden" aria-label="Beginner quick summary">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button type="button" className="flex w-full items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-left transition hover:border-primary/60 hover:bg-primary/10">
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><BookOpen className="h-5 w-5" /></span>
              <span><span className="block text-sm font-extrabold text-foreground">Quick Summary — Start Here</span><span className="mt-0.5 block text-xs text-muted-foreground">A simple explanation before the full notes</span></span>
            </span>
            <span className="shrink-0 text-xs font-bold text-primary">Open ↗</span>
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">{summary.title}</DialogTitle>
            <DialogDescription>{summary.subtitle}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm leading-relaxed text-foreground">
            <p>{summary.intro}</p>
            {summary.cards.map((c) => (
              <div key={c.heading} className="rounded-xl border border-border p-3">
                <h3 className="font-extrabold">{c.heading}</h3>
                <p className="mt-1">Think: <strong>{c.think}</strong></p>
                <p className="mt-1 text-muted-foreground">{c.body}</p>
              </div>
            ))}
            <div className="rounded-xl bg-muted p-3">
              <p className="font-extrabold">Exam memory aid</p>
              {summary.memory.map((m) => <p key={m} className="mt-1"><strong>{m}</strong></p>)}
            </div>
            <p className="text-muted-foreground">Important: {summary.caution}</p>
            <button type="button" onClick={() => setOpen(false)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-bold text-primary-foreground hover:opacity-90"><X className="h-4 w-4" /> Close summary and start reading</button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
