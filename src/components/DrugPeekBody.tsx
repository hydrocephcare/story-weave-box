import { pdrugById } from "@/pharm";
import { DrugCard } from "@/components/pharm/PharmViews";

/** The quick-read view of a drug: its card, open, inside the panel. */
export default function DrugPeekBody({ id }: { id: string }) {
  const d = pdrugById(id);
  if (!d) return <p className="text-[15px] text-muted-foreground">Open the full page to read about this drug.</p>;
  return (
    <>
      <p className="pr-8 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">{d.group}</p>
      <h2 className="mt-1 pr-8 font-serif text-3xl font-bold leading-tight text-foreground">{d.name}</h2>
      <div className="mt-4"><DrugCard d={d} defaultOpen /></div>
    </>
  );
}
