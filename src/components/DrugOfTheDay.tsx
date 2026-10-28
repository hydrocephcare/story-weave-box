import { Link } from "react-router-dom";
import { ArrowRight, Pill } from "lucide-react";
import { ALL_PDRUGS } from "@/pharm";
import { useMyYear } from "@/hooks/useMyYear";

/** One drug a day on the home page (the same for everyone on the same date): class, what it is for and how it works, with the drug card and the quiz one tap away. */
export default function DrugOfTheDay({ className = "" }: { className?: string }) {
  const { year } = useMyYear();
  // pharmacology starts in Year 2: Year 1 students are not shown drugs
  if (year !== null && year < 2) return null;
  const day = Math.floor((Date.now() + 3 * 3_600_000) / 86_400_000);   // Nairobi date
  const d = ALL_PDRUGS[(day * 7919) % ALL_PDRUGS.length];
  if (!d) return null;
  const short = (t: string, n: number) => (t.length > n ? `${t.slice(0, n).replace(/[\s,;:]+\S*$/, "")}…` : t);
  return (
    <section className={className} aria-label="Drug of the day">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-primary"><Pill className="h-3.5 w-3.5" aria-hidden /> Drug of the day</p>
      <h2 className="mt-1 font-serif text-2xl font-bold">{d.name}</h2>
      <p className="text-sm font-semibold text-muted-foreground">{d.cls}</p>
      <p className="mt-2 text-[15px] leading-relaxed text-foreground/85"><b>Used for:</b> {short(d.why, 150)}</p>
      <p className="mt-1 text-[15px] leading-relaxed text-foreground/85"><b>How it works:</b> {short(d.mech, 170)}</p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-bold">
        <Link to={`/pharmacology/drug/${d.id}?card=1`} className="inline-flex items-center gap-1 text-primary hover:underline">Open the drug card <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
        <Link to="/pharmacology/quiz" className="text-primary hover:underline">Take the drug quiz</Link>
      </div>
    </section>
  );
}
