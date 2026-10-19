import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { getUnitsForYear, unitPath, type Unit } from "@/lib/academic";

/** A student who has chosen a year sees only that year: its units, one tap from the unit page (no other years, no second list of units). */
export default function YourUnits({ year, className = "" }: { year: number; className?: string }) {
  const [units, setUnits] = useState<Unit[] | null>(null);
  useEffect(() => { let on = true; getUnitsForYear(year).then((l) => { if (on) setUnits(l); }).catch(() => { if (on) setUnits([]); }); return () => { on = false; }; }, [year]);
  if (units && units.length === 0) return null;
  return (
    <section className={className} aria-label={`Year ${year} units`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-xl font-bold text-foreground sm:text-2xl">Year {year} units</h2>
        <Link to={`/year/${year}`} className="text-xs font-bold text-primary hover:underline sm:text-sm">Year {year} page →</Link>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">Open a unit for its notes, question banks, flashcards and papers. Your year is set in your account.</p>
      {units === null ? <div className="mt-3 space-y-2" aria-busy="true">{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-9 animate-pulse rounded bg-muted" />)}</div> : (
        <ul className="mt-2 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          {units.map((u) => (
            <li key={u.id} className="border-b border-border">
              <Link to={unitPath(year, u.slug)} className="flex items-center justify-between gap-2 py-3 text-[15px] font-semibold text-foreground hover:text-primary">
                <span className="min-w-0 truncate">{u.name}</span><ArrowRight className="h-4 w-4 shrink-0 text-primary/60" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
