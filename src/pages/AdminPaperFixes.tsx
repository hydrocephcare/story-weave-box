import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Fix { id: string; article_id: string; status: string; issues: string[]; old_title: string | null; new_title: string | null; new_description: string | null; old_content: string | null; new_content: string | null; created_at: string }
type Db = { from: (t: string) => any };
const TABS = [["pending", "To approve"], ["approved", "Approved"], ["clean", "Already fine"], ["skipped", "Skipped"]] as const;

/** /admin/paper-fixes: tidier versions of written papers proposed by the AI paper doctor. A page only changes when it is approved here, and can be put back. */
export default function AdminPaperFixes() {
  const db = supabase as unknown as Db;
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("pending");
  const [rows, setRows] = useState<Fix[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(true);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const [list, all] = await Promise.all([
      db.from("paper_fixes").select("id,article_id,status,issues,old_title,new_title,new_description,old_content,new_content,created_at").eq("status", tab).order("created_at", { ascending: false }).limit(60),
      db.from("paper_fixes").select("status"),
    ]);
    if (list.error) setMsg(list.error.message); else { setRows(list.data ?? []); setMsg(""); }
    const c: Record<string, number> = {};
    for (const r of all.data ?? []) c[r.status] = (c[r.status] || 0) + 1;
    setCounts(c);
    setBusy(false);
  }, [db, tab]);
  useEffect(() => { void load(); }, [load]);

  const decide = async (f: Fix, status: string) => {
    await db.from("paper_fixes").update({ status, decided_at: new Date().toISOString() }).eq("id", f.id);
    setRows((x) => x.filter((y) => y.id !== f.id));
    setCounts((c) => ({ ...c, [f.status]: Math.max(0, (c[f.status] || 1) - 1), [status]: (c[status] || 0) + 1 }));
  };
  const approve = async (f: Fix) => {
    const { error } = await db.from("articles").update({ title: f.new_title || f.old_title, content: f.new_content, meta_description: f.new_description, updated_at: new Date().toISOString() }).eq("id", f.article_id);
    if (error) { setMsg(error.message); return; }
    setMsg(`Updated: ${f.new_title || f.old_title}`);
    await decide(f, "approved");
  };
  const undo = async (f: Fix) => {
    const { error } = await db.from("articles").update({ title: f.old_title, content: f.old_content, updated_at: new Date().toISOString() }).eq("id", f.article_id);
    if (error) { setMsg(error.message); return; }
    setMsg(`Put back: ${f.old_title}`);
    await decide(f, "rejected");
  };
  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("paper-doctor", { body: {} });
      if (error) throw new Error(error.message);
      setMsg(data?.done ? "Every written paper has been checked." : `Checked "${data?.title}": ${data?.status}.`);
      await load();
    } catch (e) { setMsg((e as Error).message); } finally { setRunning(false); }
  };

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <Link to="/admin/tools" className="text-sm font-semibold text-primary hover:underline">← Admin tools</Link>
      <h1 className="mt-2 font-serif text-4xl font-bold">Written papers</h1>
      <p className="mt-2 text-[16px] leading-relaxed text-muted-foreground">The AI paper doctor reads every written paper, completes question stems that are only a topic, makes part letters and marks consistent, corrects titles that say "MCQ Bank" over written questions, and fills any missing model answers. It checks one paper every few minutes in the background. Each change waits here: compare, approve, or throw it away. Approved pages can be put back.</p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {TABS.map(([k, label]) => <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === k ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>{label} <span className="opacity-60">{counts[k] || 0}</span></button>)}
        <button type="button" onClick={() => void runNow()} disabled={running} className="ml-auto inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-bold hover:bg-muted disabled:opacity-50">{running && <Loader2 className="h-4 w-4 animate-spin" />} Check the next paper now</button>
      </div>
      {msg && <p className="mt-4 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm">{msg}</p>}
      {busy ? <Loader2 className="mt-8 h-6 w-6 animate-spin text-primary" /> : rows.length === 0 ? <p className="mt-8 text-muted-foreground">Nothing here yet.</p> : (
        <ul className="mt-6 space-y-4">
          {rows.map((f) => (
            <li key={f.id} className="rounded-2xl border border-border bg-card p-5">
              <p className="font-serif text-lg font-bold">{f.old_title}</p>
              {f.new_title && f.new_title !== f.old_title && <p className="mt-0.5 text-sm font-semibold text-primary">→ {f.new_title}</p>}
              {f.issues.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{f.issues.map((i, n) => <li key={n}>{i}</li>)}</ul>}
              <div className="mt-4 flex flex-wrap gap-2">
                {f.new_content && <button type="button" onClick={() => setOpen(open === f.id ? null : f.id)} className="h-10 rounded-lg border border-border px-4 text-sm font-semibold">{open === f.id ? "Hide" : "Compare"}</button>}
                {f.status === "pending" && (
                  <>
                    <button type="button" onClick={() => void approve(f)} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground"><Check className="h-4 w-4" /> Approve</button>
                    <button type="button" onClick={() => void decide(f, "rejected")} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-4 text-sm font-semibold text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /> Discard</button>
                  </>
                )}
                {f.status === "approved" && <button type="button" onClick={() => void undo(f)} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-4 text-sm font-semibold"><RotateCcw className="h-4 w-4" /> Put the old version back</button>}
              </div>
              {open === f.id && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {([["Now", f.old_content], ["Proposed", f.new_content]] as const).map(([label, text]) => (
                    <div key={label}><p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p><pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-xs leading-relaxed">{text}</pre></div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
