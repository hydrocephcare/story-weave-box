import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Shuffle, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import DentalAnswer from "@/components/dental/DentalAnswer";

export interface DentalCard { key: string; front: string; back: string }

/** Flashcards made from a paper's answered questions: the question on the front, the model answer on the back. */
export default function DentalCards({ open, onOpenChange, cards, ratings, rate }: { open: boolean; onOpenChange: (v: boolean) => void; cards: DentalCard[]; ratings: Record<string, "got" | "missed">; rate: (k: string, r: "got" | "missed") => void }) {
  const [order, setOrder] = useState<number[]>([]);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const deck = useMemo(() => (order.length === cards.length ? order : cards.map((_, n) => n)), [order, cards]);
  const card = cards[deck[i]];
  const go = (d: number) => { setFlipped(false); setI((n) => Math.min(cards.length - 1, Math.max(0, n + d))); };
  const shuffle = () => { setOrder([...cards.keys()].sort(() => Math.random() - 0.5)); setI(0); setFlipped(false); };
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1); else if (e.key === "ArrowLeft") go(-1); else if (e.key === " " || e.key === "Enter") { e.preventDefault(); setFlipped((f) => !f); }
      else if (card && e.key === "1") { rate(card.key, "missed"); go(1); } else if (card && e.key === "2") { rate(card.key, "got"); go(1); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex h-[92dvh] flex-col gap-0 rounded-t-3xl p-0">
        <SheetTitle className="sr-only">Flashcards</SheetTitle>
        <SheetDescription className="sr-only">Flashcards made from the model answers of this paper.</SheetDescription>
        <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-5 pr-14"><p className="text-sm font-bold">{cards.length ? `Card ${i + 1} of ${cards.length} · ← → move, space flips, 1 missed, 2 got it` : "Flashcards"}</p><button type="button" onClick={shuffle} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary"><Shuffle className="h-4 w-4" />Shuffle</button></div>
        {!card ? <p className="px-6 py-10 text-center text-muted-foreground">Cards appear as the answers for this paper are written. Check back soon.</p> : (
          <div className="flex min-h-0 flex-1 flex-col px-5 pb-6">
            <div role="button" tabIndex={0} onClick={() => setFlipped((f) => !f)} aria-label={flipped ? "Show the question" : "Show the answer"} className="min-h-0 flex-1 cursor-pointer overflow-y-auto border-y border-border py-6 text-left">
              {!flipped ? <><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Question · tap to flip</p><p className="mt-3 font-serif text-2xl font-bold leading-snug">{card.front}</p></> : <div onClick={(e) => e.stopPropagation()} className="cursor-auto"><DentalAnswer text={card.back} label="Answer · tap the card to flip back" /></div>}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-sm font-bold">
              <button type="button" onClick={() => go(-1)} disabled={i === 0} className="inline-flex items-center gap-1 text-muted-foreground disabled:opacity-30"><ChevronLeft className="h-4 w-4" />Back</button>
              <span className="flex items-center gap-5">
                <button type="button" onClick={() => { rate(card.key, "missed"); go(1); }} className={`inline-flex items-center gap-1 ${ratings[card.key] === "missed" ? "text-rose-600" : "text-muted-foreground hover:text-foreground"}`}><X className="h-4 w-4" />Missed it</button>
                <button type="button" onClick={() => { rate(card.key, "got"); go(1); }} className={`inline-flex items-center gap-1 ${ratings[card.key] === "got" ? "text-emerald-600" : "text-muted-foreground hover:text-foreground"}`}><Check className="h-4 w-4" />Got it</button>
              </span>
              <button type="button" onClick={() => go(1)} disabled={i >= cards.length - 1} className="inline-flex items-center gap-1 text-muted-foreground disabled:opacity-30">Next<ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
