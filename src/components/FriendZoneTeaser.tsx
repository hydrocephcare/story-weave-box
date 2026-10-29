import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Gamepad2, Users } from "lucide-react";
import { openGames } from "@/lib/zone";
import { cn } from "@/lib/utils";

/** A way into Friend Zone from the pages people already read: a line about it, a button, and how many games are open to join right now. */
export default function FriendZoneTeaser({ title = "Friend Zone", blurb = "Race your friends on questions from this site. Pick a topic, share a code, and everyone starts together.", topic, className }: { title?: string; blurb?: string; topic?: string; className?: string }) {
  const [open, setOpen] = useState(0);
  useEffect(() => { let stop = false; openGames().then((r) => { if (!stop) setOpen(r.length); }).catch(() => undefined); return () => { stop = true; }; }, []);
  const to = topic ? `/friend-zone?topic=${encodeURIComponent(topic)}&game=catch` : "/friend-zone";
  return (
    <section aria-label="Friend Zone" className={cn("rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-4 sm:p-5 print:hidden", className)}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"><Gamepad2 className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-lg font-bold leading-tight">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{blurb}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link to={to} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90">Play now <ArrowRight className="h-4 w-4" aria-hidden /></Link>
            {open > 0 && <Link to="/friend-zone#zone-open" className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-bold hover:border-primary"><Users className="h-4 w-4 text-primary" aria-hidden /> {open} open {open === 1 ? "game" : "games"} to join</Link>}
          </div>
        </div>
      </div>
    </section>
  );
}
