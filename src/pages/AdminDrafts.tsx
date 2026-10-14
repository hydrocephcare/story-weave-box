import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { saveArticle } from "@/lib/store";
import { Answer } from "@/components/ai/AnswerText";

interface Draft { id: string; query: string; title: string; content: string; year: number | null; asked: number; created_at: string }
type Db = { from: (t: string) => any };

/** /admin/drafts: notes Ompath AI wrote for searches the site had nothing for. Nothing is published until it is approved here. */
export default function AdminDrafts() {
  const db = supabase as unknown as Db;
  const [rows, setRows] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(true);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, { title: string; year: number }>>({});

  const load = useCallback(async () => {
    setBusy(true);
    const r = await db.from("ai_drafts").select("id,query,title,content,year,asked,created_at").eq("status", "pending").order("asked", { ascending: false }).order("created_at", { ascending: false }).limit(100);
    if (r.error) setMsg(/relation|does not exist|schema cache/i.test(r.error.message) ? "setup" : r.error.message);
    else { setRows(r.data ?? []); setMsg(""); }
    setBusy(false);
  }, [db]);
  useEffect(() => { void load(); }, [load]);

  const pick = (d: Draft) => edit[d.id] ?? { title: d.title, year: d.year ?? 4 };
  const approve = async (d: Draft) => {
    const e = pick(d);
    try {
      const a = await saveArticle({ title: e.title, content: d.content, created_at: new Date().toISOString(), published: true, original_notes: "", category: `Year ${e.year}: ${e.title}` });
      await db.from("ai_drafts").update({ status: "approved", article_id: a.id, decided_at: new Date().toISOString() }).eq("id", d.id);
      setRows((x) => x.filter((y) => y.id !== d.id)); setMsg(`Published: ${e.title}`);
    } catch (err) { setMsg((err as Error).message); }
  };
  const reject = async (d: Draft) => {
    const { error } = await db.from("ai_drafts").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", d.id);
    if (error) setMsg(error.message); else setRows((x) => x.filter((y) => y.id !== d.id));
  };

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link to="/admin/tools" className="text-sm font-semibold text-primary hover:underline">← Admin tools</Link>
      <h1 className="mt-2 font-serif text-4xl font-bold">Notes to approve</h1>
      <p className="mt-2 text-[16px] text-muted-foreground">When a student asks Ompath AI about something the site has no notes on, the answer waits here. Read it, fix the title or year, and publish it, or throw it away. Nothing goes live on its own.</p>
      {msg === "setup" ? <p className="mt-6 rounded-lg border border-border bg-muted p-4 text-sm">The drafts table is not set up yet. Ask Lovable to apply the migration <b>20261015090000_ai_drafts.sql</b>.</p> : msg && <p className="mt-4 text-sm text-muted-foreground" role="status">{msg}</p>}
      {busy ? <Loader2 className="mt-8 h-6 w-6 animate-spin text-primary" /> : rows.length === 0 && msg !== "setup" ? <p className="mt-8 text-muted-foreground">Nothing waiting. Drafts appear when students ask for notes the site does not have.</p> : (
        <ul className="mt-8 space-y-5">
          {rows.map((d) => (
            <li key={d.id} className="rounded-xl border border-border p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-primary">Asked {d.asked}× · “{d.query}”</p>
              <input value={pick(d).title} onChange={(e) => setEdit((x) => ({ ...x, [d.id]: { ...pick(d), title: e.target.value } }))} aria-label="Title" className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 font-serif text-lg font-bold" />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select value={pick(d).year} onChange={(e) => setEdit((x) => ({ ...x, [d.id]: { ...pick(d), year: Number(e.target.value) } }))} aria-label="Year" className="h-10 rounded-lg border border-border bg-background px-2 text-sm">{[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>Year {y}</option>)}</select>
                <button type="button" onClick={() => setOpen(open === d.id ? null : d.id)} className="h-10 rounded-lg border border-border px-3 text-sm font-semibold">{open === d.id ? "Hide" : "Read"}</button>
                <button type="button" onClick={() => void approve(d)} className="h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground">Approve and publish</button>
                <button type="button" onClick={() => void reject(d)} className="h-10 rounded-lg border border-border px-3 text-sm font-semibold text-muted-foreground hover:text-destructive">Discard</button>
              </div>
              {open === d.id && <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-lg bg-muted/40 p-4"><Answer text={d.content} /></div>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
