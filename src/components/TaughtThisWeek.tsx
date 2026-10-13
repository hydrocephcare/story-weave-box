import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck } from "lucide-react";
import { STATIC_NOTES } from "@/data/staticNotes";
import { coverage, currentWeek, semesterLabel, useOutlineDocs, weekRange } from "@/lib/outlineSync";

/** "Taught this week" for a year: the outline rows of the current teaching week, each linking to the note that covers it when there is one. */
export default function TaughtThisWeek({ year, className = "" }: { year: number; className?: string }) {
  const docs = useOutlineDocs();
  const items = useMemo(() => {
    const out: { key: string; topic: string; lecturer: string; sub: string; to: string | null }[] = [];
    for (const d of docs) {
      if (d.year !== year || !d.startDate) continue;
      const wk = currentWeek(d.startDate);
      if (!wk) continue;
      for (const r of d.rows) {
        const range = weekRange(r.week);
        if (!range || wk < range[0] || wk > range[1]) continue;
        const note = STATIC_NOTES.filter((n) => n.year === year && !n.paper).map((n) => ({ n, c: coverage(r.topic, n.title) })).filter((x) => x.c >= 0.74).sort((a, b) => b.c - a.c)[0]?.n;
        out.push({ key: `${d.id}:${r.id}`, topic: r.topic, lecturer: r.lecturer, sub: [d.unit, semesterLabel(d.semester), `Week ${wk}`].filter(Boolean).join(" · "), to: note ? `/notes/${note.slug}` : null });
      }
    }
    return out.slice(0, 8);
  }, [docs, year]);
  if (!items.length) return null;
  return (
    <section aria-label="Taught this week" className={className}>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Year {year} · this week</p>
      <h2 className="mt-1 font-serif text-2xl font-bold sm:text-3xl">Taught this week</h2>
      <ul className="mt-4 space-y-3">
        {items.map((i) => {
          const body = (<><CalendarCheck className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden /><span className="min-w-0 flex-1"><span className="block text-[16px] font-semibold leading-snug">{i.topic}</span><span className="block text-xs text-muted-foreground">{[i.sub, i.lecturer].filter(Boolean).join(" · ")}{i.to ? " · note ready" : ""}</span></span></>);
          return <li key={i.key}>{i.to ? <Link to={i.to} className="flex items-start gap-3 hover:text-primary">{body}</Link> : <div className="flex items-start gap-3">{body}</div>}</li>;
        })}
      </ul>
    </section>
  );
}
