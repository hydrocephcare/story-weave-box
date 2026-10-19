import { Link } from "react-router-dom";
import { ArrowRight, Layers } from "lucide-react";
import { useDueCount, useMyDecks } from "@/lib/myDecks";
import { cleanTopicTitle } from "../../supabase/functions/_shared/topicTitle.js";

/** "Revise what you read": the flashcard decks made for the notes you have finished, a tap from the home page. */
export default function MyDecksCard({ className = "" }: { className?: string }) {
  const decks = useMyDecks();
  const due = useDueCount();
  if ((!decks || decks.length === 0) && due === 0) return null;
  return (
    <section className={className} aria-label="Flashcards from what you read">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-xl font-bold text-foreground">Revise what you read</h2>
        <Link to="/flashcards" className="text-xs font-bold text-primary hover:underline">All my flashcards →</Link>
      </div>
      {due > 0 && <Link to="/flashcards/today" className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">{due} card{due === 1 ? "" : "s"} due today · Start</Link>}
      <p className="mt-2 text-xs text-muted-foreground">Flashcards are made for each note you finish reading.</p>
      <ul className="mt-1 divide-y divide-border border-y border-border">
        {(decks ?? []).slice(0, 3).map((d) => (
          <li key={d.id}>
            <Link to={d.path} className="group flex items-center gap-3 py-3">
              <Layers className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground group-hover:text-primary">{cleanTopicTitle(d.title.replace(/\s*[:—–-]?\s*Flashcards?$/i, ""))}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-primary/50" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
