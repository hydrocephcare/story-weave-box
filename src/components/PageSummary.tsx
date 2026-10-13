import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type Entry = { s: string; t: string[] };
let memo: Promise<Record<string, Entry>> | null = null;
const load = () => (memo ??= import("@/data/pageSummaries.json").then((m) => (m.default ?? m) as Record<string, Entry>).catch(() => ({})));

/**
 * "In a nutshell": three lines on what a page teaches and its key terms, written once for each note and blog.
 * Renders nothing until the page has one (they are written a few every morning).
 */
export default function PageSummary({ id, minutes, className = "" }: { id: string; minutes?: number; className?: string }) {
  const [entry, setEntry] = useState<Entry | null>(null);
  useEffect(() => { let on = true; void load().then((all) => on && setEntry(all[id] ?? null)); return () => { on = false; }; }, [id]);
  if (!entry && !minutes) return null;
  return (
    <div className={className}>
      {entry && (
        <>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">In a nutshell{minutes ? ` · ${minutes} min read` : ""}</p>
          <p className="mt-1.5 max-w-[68ch] text-[17px] leading-[1.65] text-foreground/85">{entry.s}</p>
          {entry.t.length > 0 && (
            <p className="mt-3 flex flex-wrap gap-x-2 gap-y-1.5 text-sm">
              {entry.t.map((t) => <Link key={t} to={`/search?q=${encodeURIComponent(t)}`} className="rounded-full border border-border px-3 py-1 font-semibold text-foreground/80 transition hover:border-primary/60 hover:text-primary">{t}</Link>)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
