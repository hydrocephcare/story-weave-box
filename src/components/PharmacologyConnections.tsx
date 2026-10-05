import { Pill } from "lucide-react";
import drugIndex from "@/data/drugIndex.json";
import { CONDITIONS } from "@/pharm/conditions";
import { drugHref } from "@/lib/noteLinks";

interface DrugEntry { id: string; name: string; terms: string[] }
const DRUGS = drugIndex as DrugEntry[];
const nameOf = (id: string) => (DRUGS.find((d) => d.id === id)?.name ?? id).replace(/\s*\(.*\)/, "").split(" / ")[0];

/**
 * The drugs in a note and the matching drug guides, as buttons. `leave` is called with the destination so the
 * note can remember where you were reading and offer a way back.
 */
export default function PharmacologyConnections({ ids, conditionIds, leave, className = "" }: { ids: string[]; conditionIds: string[]; leave: (to: string) => void; className?: string }) {
  const conditions = conditionIds.map((id) => CONDITIONS.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  if (conditions.length === 0 && ids.length === 0) return null;
  return (
    <aside aria-label="Pharmacology connections" className={`rounded-xl border border-primary/30 bg-primary/5 p-4 print:hidden ${className}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary"><Pill className="h-3.5 w-3.5" /> Pharmacology connections</p>
      {conditions.slice(0, 2).map((c) => (
        <button key={c.id} type="button" onClick={() => leave(`/pharmacology?tab=conditions&c=${c.id}`)} className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm font-bold text-foreground transition-colors hover:border-primary/50 hover:text-primary">
          <span>Drug guide for {c.name}<span className="block text-xs font-medium text-muted-foreground">First-line, add-ons, what to avoid, what to monitor</span></span>
          <span aria-hidden="true">→</span>
        </button>
      ))}
      {ids.length > 0 && (
        <>
          <p className="mt-3 text-xs font-semibold text-muted-foreground">Drugs in this note. Tap one for its card, then use Back to return to this spot.</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ids.slice(0, 14).map((id) => <button key={id} type="button" onClick={() => leave(drugHref(id))} className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary">{nameOf(id)}</button>)}
          </div>
        </>
      )}
    </aside>
  );
}
