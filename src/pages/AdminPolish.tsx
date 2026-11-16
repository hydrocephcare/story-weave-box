import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import PolishConnect from "@/components/PolishConnect";

interface Row { article_id: string; status: string; verdict: string | null; reason: string | null; title: string | null; updated_at: string; ai_review_status: string | null; ai_review_issues: any[] | null; articles: { title: string; category: string; slug: string | null } | null }
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
    const flagged = await db.from("blog_polish").select("article_id,status,verdict,reason,title,updated_at,ai_review_status,ai_review_issues,articles(title,category,slug)").or("verdict.in.(irrelevant,review),ai_review_status.eq.held").order("updated_at", { ascending: false }).limit(200);
    if (flagged.error) { setMsg(/relation|does not exist|schema cache/i.test(flagged.error.message) ? "setup" : flagged.error.message); setBusy(false); return; }
    setRows((flagged.data ?? []) as Row[]);
    const all = await db.from("blog_polish").select("status,ai_review_status").limit(5000);
    const c: Record<string, number> = {};
    for (const r of (all.data ?? []) as { status: string; ai_review_status: string | null }[]) {
      c[r.status] = (c[r.status] ?? 0) + 1;
      if (r.ai_review_status === "passed") c.verified = (c.verified ?? 0) + 1;
      if (r.ai_review_status === "held") c.held = (c.held ?? 0) + 1;
    }
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

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Admin</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Polished blogs</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">Published articles are enhanced automatically by the daily Groq writer and independently checked by Gemini. Only passed articles receive the AI cross-check label. Articles that fail verification remain unchanged and are automatically retried; AI verification is not clinician review.</p>

      <PolishConnect />

      {msg === "setup" ? (
        <p className="mt-8 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">The database tables for this are being set up. Try again in a few minutes.</p>
      ) : (
        <>
          {busy && <p className="mt-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
          {!busy && (
            <p className="mt-6 text-[16px] text-foreground/85">{total} articles processed: {counts.done ?? 0} finished, {counts.verified ?? 0} Gemini-verified, {counts.held ?? 0} held for automatic correction, {counts.partial ?? 0} partly complete, {counts.working ?? 0} in progress, {counts.failed ?? 0} failed.</p>
          )}
          {msg && <p className="mt-3 text-sm font-semibold text-primary" role="status">{msg}</p>}
          {!busy && rows.length === 0 && !msg && <p className="mt-8 text-muted-foreground">Nothing flagged yet.</p>}
          <ul className="mt-8 space-y-8">
            {rows.map((r) => (
              <li key={r.article_id}>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{r.verdict === "irrelevant" ? "Not study material" : "Weak or unclear"} · {r.articles?.category ?? ""}</p>
                <p className="mt-1 font-serif text-2xl font-bold">{r.articles?.title ?? r.article_id}</p>
                {r.reason && <p className="mt-1 text-[15px] text-muted-foreground">{r.reason}</p>}
                {r.ai_review_status === "held" && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Gemini did not clear this article. The original remains visible; the daily job will attempt an automatic correction and re-check.</p>}
                {r.ai_review_status === "passed" && <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">Gemini cross-check passed.</p>}
                <div className="mt-3 flex flex-wrap gap-2 text-sm font-bold">
                  {r.articles?.slug && <Link to={`/blog/${r.articles.slug}`} className="rounded-full border border-border px-4 py-2 hover:border-primary/60">Open</Link>}
                  <button type="button" onClick={() => hide(r)} className="rounded-full bg-destructive px-4 py-2 text-destructive-foreground">Hide this page</button>
                  <button type="button" onClick={() => keep(r)} className="rounded-full border border-border px-4 py-2 hover:border-primary/60">Keep it</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
