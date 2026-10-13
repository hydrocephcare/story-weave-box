import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Row { article_id: string; status: string; verdict: string | null; reason: string | null; title: string | null; updated_at: string; articles: { title: string; category: string; slug: string | null } | null }
type Db = { from: (t: string) => any };

/** /admin/polish: what the polish has done, and the blogs it thinks are weak or irrelevant. Nothing is deleted without a tap here. */
export default function AdminPolish() {
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(true);
  const db = supabase as unknown as Db;

  const load = useCallback(async () => {
    setBusy(true);
    const flagged = await db.from("blog_polish").select("article_id,status,verdict,reason,title,updated_at,articles(title,category,slug)").in("verdict", ["irrelevant", "review"]).order("updated_at", { ascending: false }).limit(200);
    if (flagged.error) { setMsg(/relation|does not exist|schema cache/i.test(flagged.error.message) ? "setup" : flagged.error.message); setBusy(false); return; }
    setRows((flagged.data ?? []) as Row[]);
    const all = await db.from("blog_polish").select("status").limit(2000);
    const c: Record<string, number> = {};
    for (const r of (all.data ?? []) as { status: string }[]) c[r.status] = (c[r.status] ?? 0) + 1;
    setCounts(c);
    setMsg(""); setBusy(false);
  }, [db]);
  useEffect(() => { void load(); }, [load]);

  const hide = async (r: Row) => {
    const { error } = await db.from("articles").update({ published: false, deleted_at: new Date().toISOString() }).eq("id", r.article_id);
    setMsg(error ? error.message : `Hidden: ${r.articles?.title ?? r.article_id}. It can be restored from the database.`);
    if (!error) setRows((x) => x.filter((y) => y.article_id !== r.article_id));
  };
  const keep = async (r: Row) => {
    const { error } = await db.from("blog_polish").update({ verdict: "keep" }).eq("article_id", r.article_id);
    if (error) setMsg(error.message); else setRows((x) => x.filter((y) => y.article_id !== r.article_id));
  };
  const redo = async (r: Row) => {
    const { error } = await db.from("blog_polish").delete().eq("article_id", r.article_id);
    if (error) setMsg(error.message); else { setMsg("Removed. The next person to open the page starts a fresh polish."); setRows((x) => x.filter((y) => y.article_id !== r.article_id)); }
  };

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Admin</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Polished blogs</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">The first time someone opens a Year 1 to 3 blog, it gets a clear title, a search description and a tidier text. That copy is kept for everyone. Pages the polish thinks are weak or not study material are listed here for you to decide.</p>

      {msg === "setup" ? (
        <div className="mt-8 max-w-2xl text-[16px] leading-relaxed text-foreground/85">
          <p className="font-serif text-2xl font-bold">Two steps to switch this on</p>
          <p className="mt-3">1. Open the Supabase SQL editor, paste the contents of <strong>supabase/migrations/20261014090000_blog_polish.sql</strong> and run it once.</p>
          <p className="mt-2">2. In Vercel, add the setting <strong>SUPABASE_SERVICE_ROLE_KEY</strong> (from Supabase, Project settings, API) as a Secret, then redeploy.</p>
        </div>
      ) : (
        <>
          {busy && <p className="mt-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
          {!busy && (
            <p className="mt-6 text-[16px] text-foreground/85">{total} blogs polished so far: {counts.done ?? 0} finished, {counts.partial ?? 0} partly, {counts.working ?? 0} in progress, {counts.failed ?? 0} failed.</p>
          )}
          {msg && <p className="mt-3 text-sm font-semibold text-primary" role="status">{msg}</p>}
          {!busy && rows.length === 0 && !msg && <p className="mt-8 text-muted-foreground">Nothing flagged yet.</p>}
          <ul className="mt-8 space-y-8">
            {rows.map((r) => (
              <li key={r.article_id}>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{r.verdict === "irrelevant" ? "Not study material" : "Weak or unclear"} · {r.articles?.category ?? ""}</p>
                <p className="mt-1 font-serif text-2xl font-bold">{r.articles?.title ?? r.article_id}</p>
                {r.reason && <p className="mt-1 text-[15px] text-muted-foreground">{r.reason}</p>}
                <div className="mt-3 flex flex-wrap gap-2 text-sm font-bold">
                  {r.articles?.slug && <Link to={`/blog/${r.articles.slug}`} className="rounded-full border border-border px-4 py-2 hover:border-primary/60">Open</Link>}
                  <button type="button" onClick={() => hide(r)} className="rounded-full bg-destructive px-4 py-2 text-destructive-foreground">Hide this page</button>
                  <button type="button" onClick={() => keep(r)} className="rounded-full border border-border px-4 py-2 hover:border-primary/60">Keep it</button>
                  <button type="button" onClick={() => redo(r)} className="rounded-full border border-border px-4 py-2 hover:border-primary/60">Polish again</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
