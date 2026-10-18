import { BookMarked } from "lucide-react";
import { affiliatesFor, useMonetise } from "@/lib/monetise";

/** Books and courses an admin has linked to the subjects a page is about. Shows nothing when none match. Links are marked as sponsored. */
export default function BooksForPage({ text, className = "", compact = false }: { text: string; className?: string; compact?: boolean }) {
  const { affiliates } = useMonetise();
  const hits = affiliatesFor(affiliates, text);
  if (!hits.length) return null;
  return (
    <section className={className} aria-label="Books and courses">
      {compact ? <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground"><BookMarked className="h-4 w-4 text-primary" aria-hidden /> Books for this topic</h3> : <h2 className="font-serif text-[1.6rem] font-bold sm:text-[2rem]">To read next</h2>}
      <ul className={compact ? "mt-2 space-y-2 text-sm" : "mt-4 space-y-3"}>
        {hits.map((a) => (
          <li key={a.id}><a href={a.url} target="_blank" rel="noopener noreferrer sponsored" className="group flex items-start gap-3"><BookMarked className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden /><span><span className="block font-semibold group-hover:text-primary">{a.title}</span><span className="block text-xs text-muted-foreground">{a.label || "Book or course"} · opens in a new tab</span></span></a></li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">Some links may earn Ompath Study a small commission at no cost to you.</p>
    </section>
  );
}
