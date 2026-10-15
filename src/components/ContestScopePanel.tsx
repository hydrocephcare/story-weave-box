import { useEffect, useState } from "react";
import { Globe2, Loader2 } from "lucide-react";
import { setContestUniversityScope, type ContestRecord, type ContestUniversity } from "@/lib/contest-store";

/** Admin: open a contest to every university, or limit it to the ones ticked (2, 3, ...). */
export default function ContestScopePanel({ contest, universities, onSaved }: { contest: ContestRecord; universities: (ContestUniversity & { active: boolean })[]; onSaved: () => Promise<void> | void }) {
  const [chosen, setChosen] = useState<string[]>(contest.universityIds);
  const [limited, setLimited] = useState(contest.universityIds.length > 0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { setChosen(contest.universityIds); setLimited(contest.universityIds.length > 0); setMsg(""); }, [contest.id, contest.universityIds]);
  const active = universities.filter((u) => u.active);
  const toggle = (id: string) => setChosen((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  async function save() {
    setBusy(true); setMsg("");
    try { await setContestUniversityScope(contest.id, limited ? chosen : []); await onSaved(); setMsg(limited ? `Saved: open to ${chosen.length} universities.` : "Saved: open to all universities."); }
    catch (e: any) { setMsg(e?.message?.includes("university_ids") ? "Run the 'university scope' SQL file first." : e?.message || "Could not save."); }
    finally { setBusy(false); }
  }
  return (
    <div className="rounded-xl border p-4">
      <p className="flex items-center gap-2 text-sm font-bold"><Globe2 className="h-4 w-4 text-primary" /> Who can enter</p>
      <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
        <button type="button" onClick={() => setLimited(false)} className={`rounded-lg border px-3 py-2 ${!limited ? "border-primary bg-primary/10 text-primary" : ""}`}>All universities</button>
        <button type="button" onClick={() => setLimited(true)} className={`rounded-lg border px-3 py-2 ${limited ? "border-primary bg-primary/10 text-primary" : ""}`}>Only chosen universities</button>
      </div>
      {limited && (
        <>
          <p className="mt-3 text-xs text-muted-foreground">Tick 2 for a head-to-head, 3 for a triangular, or as many as you like. Only these appear on the registration form.</p>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {active.map((u) => (
              <li key={u.id}><label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={chosen.includes(u.id)} onChange={() => toggle(u.id)} className="accent-primary" /> <span className="truncate">{u.name}</span></label></li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-4 flex items-center gap-3">
        <button type="button" disabled={busy || (limited && chosen.length < 2)} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</button>
        {limited && chosen.length < 2 && <span className="text-xs text-muted-foreground">Pick at least 2.</span>}
        {msg && <span className="text-xs font-semibold">{msg}</span>}
      </div>
    </div>
  );
}
