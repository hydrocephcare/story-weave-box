import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileQuestion } from "lucide-react";
import { PAPER_NOTES } from "@/data/staticNotes";
import PaperScanButton from "@/components/PaperScanButton";

/** The newest past papers, each with its questions and the original scan, on the home page and on a year's page. */
export default function PapersStrip({ year, limit = 6 }: { year?: number; limit?: number }) {
  const [all, setAll] = useState(false);
  const list = useMemo(
    // Newest addition first: the notes file lists papers in the order they were added.
    () => [...PAPER_NOTES].reverse().filter((p) => year === undefined || p.year === year),
    [year],
  );
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, limit);
  return (
    <section className="mx-auto max-w-6xl px-5 pt-10 sm:pt-14" aria-labelledby={`papers-strip-${year ?? "all"}`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={`papers-strip-${year ?? "all"}`} className="flex items-center gap-2 font-serif text-xl font-bold text-foreground sm:text-2xl"><FileQuestion className="h-5 w-5 text-primary" /> Past papers{year ? ` for Year ${year}` : ""}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{list.length} papers typed up from the scans, with answers behind Reveal. Tap Original scan to see the real paper.</p>
        </div>
        <Link to="/papers" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline sm:text-sm">All past papers <ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {shown.map((p) => (
          <li key={p.slug} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3.5">
            <Link to={`/notes/${p.slug}`} className="block">
              <p className="text-[11px] font-bold uppercase tracking-wider text-primary">{p.unit} · {p.paper.satLabel}</p>
              <h3 className="mt-0.5 text-[14.5px] font-bold leading-snug text-foreground hover:text-primary">{p.title}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{[p.paper.mcq ? `${p.paper.mcq} MCQ` : "", p.paper.saq ? `${p.paper.saq} written` : ""].filter(Boolean).join(" · ")}{!p.paper.complete ? " · pages missing" : ""}</p>
            </Link>
            <div className="mt-auto flex flex-wrap gap-2">
              <Link to={`/notes/${p.slug}`} className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:bg-primary/90">Questions</Link>
              <PaperScanButton driveId={p.paper.driveId} name={p.paper.source} />
            </div>
          </li>
        ))}
      </ul>
      {list.length > limit && (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => setAll((v) => !v)} className="rounded-lg border border-border bg-card px-6 py-2.5 text-sm font-bold text-foreground hover:border-primary/40 hover:text-primary">{all ? "Show fewer" : `Show all ${list.length}`}</button>
        </div>
      )}
    </section>
  );
}
