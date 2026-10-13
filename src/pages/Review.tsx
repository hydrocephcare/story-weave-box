import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Flame } from "lucide-react";
import { srs, streak, useSrs, type Grade } from "@/lib/srs";
import HeroAurora from "@/components/HeroAurora";
import { cn } from "@/lib/utils";

/** /review: the flashcards you made from pages, shown when they are due. Rate how well you remembered and the next one comes back sooner or later. */
export default function Review() {
  const all = useSrs();
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);
  const due = useMemo(() => srs.due(), [all, done]); // eslint-disable-line react-hooks/exhaustive-deps
  const card = due[0];
  const s = streak.get();
  const rate = (g: Grade) => { if (!card) return; srs.grade(card.id, g); setShown(false); setDone((n) => n + 1); };
  const next = (g: Grade) => ({ 0: "10 min", 1: "1 day", 2: "soon", 3: "days" }[g]);

  return (
    <main>
      <Helmet><title>Daily review | Ompath Study</title><meta name="description" content="Review the flashcards you made from your notes: the ones you are about to forget come first." /><meta name="robots" content="noindex" /></Helmet>
      <header className="relative isolate overflow-hidden"><HeroAurora about="Medicine" />
        <div className="mx-auto max-w-2xl px-5 pb-10 pt-10 sm:pt-14">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Your cards</p>
          <h1 className="mt-1 font-serif text-4xl font-bold sm:text-5xl">Daily review</h1>
          <p className="mt-3 flex items-center gap-2 text-[16px] text-foreground/80"><Flame className={cn("h-5 w-5", s.n ? "text-orange-500" : "text-muted-foreground")} aria-hidden />{s.n ? `${s.n}-day streak${s.today ? ", kept for today" : ". Review a card to keep it."}` : "Review a card to start a streak."} · {all.length} cards · {due.length} due</p>
        </div>
      </header>

      <section className="mx-auto max-w-2xl px-5 py-10">
        {all.length === 0 ? (
          <div>
            <p className="font-serif text-2xl font-bold">No cards yet</p>
            <p className="mt-2 text-[17px] leading-relaxed text-foreground/80">Open any note or topic page and tap <strong>Make flashcards</strong>. Eight cards from that page appear here, and come back just before you would forget them.</p>
            <Link to="/topics" className="mt-5 inline-flex h-12 items-center rounded-full bg-primary px-7 font-bold text-primary-foreground">Browse topics</Link>
          </div>
        ) : !card ? (
          <div>
            <p className="font-serif text-2xl font-bold">All done for now</p>
            <p className="mt-2 text-[17px] leading-relaxed text-foreground/80">Nothing is due. {done ? `You reviewed ${done} card${done === 1 ? "" : "s"} this session.` : ""} The next ones come back later today or tomorrow.</p>
          </div>
        ) : (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{card.title}</p>
            <p className="mt-3 font-serif text-[1.7rem] font-bold leading-snug sm:text-3xl">{card.q}</p>
            {shown ? (
              <>
                <p className="mt-6 text-[18px] leading-relaxed text-foreground/90">{card.a}</p>
                <p className="mt-8 text-sm font-semibold text-muted-foreground">How well did you remember it?</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {([[0, "Again"], [1, "Hard"], [2, "Good"], [3, "Easy"]] as [Grade, string][]).map(([g, label]) => (
                    <button key={g} type="button" onClick={() => rate(g)} className={cn("h-12 min-w-[5.5rem] rounded-full border px-5 text-sm font-bold transition active:scale-[.97]", g === 2 ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/60")}>{label}<span className="block text-[10px] font-medium opacity-70">{next(g)}</span></button>
                  ))}
                </div>
                <Link to={card.path} className="mt-6 inline-block text-sm font-bold text-primary hover:underline">Open the page this came from</Link>
              </>
            ) : (
              <button type="button" onClick={() => setShown(true)} className="mt-8 h-12 rounded-full bg-primary px-8 font-bold text-primary-foreground active:scale-[.97]">Show the answer</button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
