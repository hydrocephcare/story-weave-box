import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ruleFromExample, ruleMatches } from "@/lib/admissionRule";

interface Rule { id: string; label: string; pattern: string; replacement: string; active: boolean }
type Db = { from: (t: string) => any };

/** /admin/access: which admission numbers open the books. A student whose number fits an active rule is verified at once; anyone else waits for you. */
export default function AdminAccess() {
  const db = supabase as unknown as Db;
  const [rules, setRules] = useState<Rule[]>([]);
  const [busy, setBusy] = useState(true);
  const [msg, setMsg] = useState("");
  const [example, setExample] = useState("");
  const [label, setLabel] = useState("");
  const [probe, setProbe] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    const r = await db.from("admission_rules").select("id,label,pattern,replacement,active").order("created_at");
    if (r.error) setMsg(/relation|does not exist|schema cache/i.test(r.error.message) ? "setup" : r.error.message); else { setRules(r.data ?? []); setMsg(""); }
    setBusy(false);
  }, [db]);
  useEffect(() => { void load(); }, [load]);

  const draft = example.trim() ? ruleFromExample(example) : null;
  const add = async () => {
    if (!draft) return;
    const { error } = await db.from("admission_rules").insert({ label: (label.trim() || `${example.trim()} style`).slice(0, 80), pattern: draft.pattern, replacement: draft.replacement });
    if (error) setMsg(error.message); else { setExample(""); setLabel(""); setMsg("Rule added. New sign-ups in this format are verified automatically."); void load(); }
  };
  const toggle = async (r: Rule) => {
    const { error } = await db.from("admission_rules").update({ active: !r.active }).eq("id", r.id);
    if (error) setMsg(error.message); else setRules((x) => x.map((y) => (y.id === r.id ? { ...y, active: !r.active } : y)));
  };
  const remove = async (r: Rule) => {
    if (!window.confirm(`Delete the rule "${r.label}"?`)) return;
    const { error } = await db.from("admission_rules").delete().eq("id", r.id);
    if (error) setMsg(error.message); else setRules((x) => x.filter((y) => y.id !== r.id));
  };
  const hit = probe.trim() ? rules.find((r) => r.active && ruleMatches(r.pattern, probe)) : null;

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <h1 className="font-serif text-4xl font-bold">Book access rules</h1>
      <p className="mt-2 text-[16px] text-muted-foreground">Books, timetables and past papers are for students whose admission number fits one of these rules. A number that fits an active rule is verified straight away. Anything else is a request you approve by hand under MKU students.</p>
      {msg === "setup" && <p className="mt-6 rounded-lg border border-border bg-muted p-4 text-sm">The rules table is not set up yet. Run <b>20261015140000_visitors_by_person_and_admission_rules.sql</b> once in Lovable's SQL editor.</p>}
      {msg && msg !== "setup" && <p className="mt-4 text-sm text-muted-foreground" role="status">{msg}</p>}

      {busy ? <Loader2 className="mt-8 h-6 w-6 animate-spin text-primary" /> : msg !== "setup" && (
        <>
          <ul className="mt-6 space-y-2">
            {rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
                <div className="min-w-0 flex-1"><p className="font-semibold">{r.label}</p><p className="truncate text-xs text-muted-foreground">{r.active ? "Active" : "Off"} · saved as {r.replacement.replace(/\\(\d)/g, "…")}</p></div>
                <button type="button" onClick={() => void toggle(r)} aria-pressed={r.active} className={`rounded-full border px-3 py-1 text-xs font-bold ${r.active ? "border-emerald-600 bg-emerald-600 text-white" : "border-border"}`}>{r.active ? "On" : "Off"}</button>
                <button type="button" onClick={() => void remove(r)} className="rounded-full border border-border px-3 py-1 text-xs font-bold hover:border-destructive hover:text-destructive">Delete</button>
              </li>
            ))}
            {rules.length === 0 && <li className="text-sm text-muted-foreground">No rules yet: every request waits for your approval.</li>}
          </ul>

          <section className="mt-8 rounded-2xl border border-border bg-card p-4" aria-label="Add a rule">
            <h2 className="font-serif text-xl font-bold">Allow another format</h2>
            <p className="text-sm text-muted-foreground">Type one real example. The rule copies its shape: the same letters, the same number of digits.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input value={example} onChange={(e) => setExample(e.target.value)} placeholder="e.g. BMS/2023/60482 or MBCHB262700349" aria-label="Example admission number" className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm" />
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name (optional)" aria-label="Rule name" className="h-11 w-44 rounded-lg border border-border bg-background px-3 text-sm" />
              <button type="button" disabled={!draft} onClick={() => void add()} className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"><Plus className="h-4 w-4" aria-hidden /> Add</button>
            </div>
            {example.trim() && !draft && <p className="mt-2 text-sm text-destructive">That does not look like an admission number: use letters first, then digits (separators are fine).</p>}
          </section>

          <section className="mt-6 rounded-2xl border border-border bg-card p-4" aria-label="Try a number">
            <h2 className="font-serif text-xl font-bold">Try a number</h2>
            <input value={probe} onChange={(e) => setProbe(e.target.value)} placeholder="Type an admission number to see if it would be verified" aria-label="Admission number to test" className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            {probe.trim() && <p className={`mt-2 text-sm font-semibold ${hit ? "text-emerald-600" : "text-amber-600"}`} role="status">{hit ? `Verified automatically (rule: ${hit.label}).` : "Would wait for your approval."}</p>}
          </section>
        </>
      )}
    </main>
  );
}
