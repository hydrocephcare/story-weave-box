import { useEffect, useMemo, useState } from "react";
import { FileText, Info } from "lucide-react";
import { paperOpening, pickPapers } from "@/lib/ompathAiTools";
import type { PaperNote } from "@/data/staticNotes";
import type { SiteHit } from "@/lib/siteSearch";

export const paperHit = (n: PaperNote): SiteHit => ({ key: `static-${n.slug}`, group: "Notes", title: n.title, subtitle: `Year ${n.year} · ${n.unit} · ${n.paper.satLabel}`, href: `/notes/${n.slug}`, kind: "paper", score: 100 });

/**
 * A past paper shown the way a printed one looks on a desk: the first lines clear, then fading into the page. Tap anywhere to read the
 * whole paper in a pop-up. If the paper asked for is not on the site, the closest one is shown and it says so.
 */
export default function PaperCard({ topic, year, latest, onOpen }: { topic: string; year: number | null; latest: boolean; onOpen: (hit: SiteHit) => void }) {
  const pick = useMemo(() => pickPapers(topic, year, latest), [topic, year, latest]);
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => { let on = true; if (pick) void paperOpening(pick.best.slug).then((t) => { if (on) setOpening(t); }); return () => { on = false; }; }, [pick]);

  if (!pick) return <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">There are no past papers on the site yet.</p>;
  const { best, others, exact } = pick;
  return (
    <section className="space-y-2.5" aria-label="Past paper">
      {!exact && <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> I do not have a paper exactly on “{topic}”, so here is the closest one.</p>}
      <button type="button" onClick={() => onOpen(paperHit(best))} className="group block w-full overflow-hidden rounded-2xl border border-border bg-card text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="flex items-start gap-3 border-b border-border bg-muted/40 px-3.5 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10"><FileText className="h-5 w-5 text-primary" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-serif text-base font-bold leading-snug">{best.title}</span>
            <span className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-semibold">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">Year {best.year}</span>
              <span className="rounded-full bg-foreground/5 px-2 py-0.5">{best.paper.kind}</span>
              <span className="rounded-full bg-foreground/5 px-2 py-0.5">{best.paper.satLabel}</span>
              {best.paper.mcq > 0 && <span className="rounded-full bg-foreground/5 px-2 py-0.5">{best.paper.mcq} MCQs</span>}
              {best.paper.saq > 0 && <span className="rounded-full bg-foreground/5 px-2 py-0.5">{best.paper.saq} SAQs</span>}
            </span>
          </span>
        </div>
        <div className="relative px-4 pb-1 pt-3">
          <div className="max-h-44 overflow-hidden whitespace-pre-line font-serif text-[13px] leading-6 text-foreground/90">{opening ?? "Opening the paper…"}</div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-card via-card/90 to-transparent" aria-hidden="true" />
        </div>
        <div className="-mt-1 flex items-center justify-center px-4 pb-3.5 pt-1"><span className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-transform group-active:scale-95">Tap to read the full paper</span></div>
        {!best.paper.complete && <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">Some pages are missing from this scan{best.paper.missing ? `: ${best.paper.missing}` : ""}.</p>}
      </button>
      {others.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Similar papers</p>
          <div className="grid gap-1.5">{others.map((o) => <button key={o.slug} type="button" onClick={() => onOpen(paperHit(o))} className="rounded-xl border border-border bg-card px-3 py-2 text-left text-sm hover:border-primary/50"><span className="block font-semibold leading-snug">{o.title}</span><span className="block text-xs text-muted-foreground">Year {o.year} · {o.paper.satLabel}</span></button>)}</div>
        </div>
      )}
    </section>
  );
}
