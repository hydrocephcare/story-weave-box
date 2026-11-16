import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
type Db = { from: (t: string) => any };
interface Row { slug: string; name: string; category: string | null; deepReady: boolean; aiReviewed: boolean; up: number; down: number }
const isDeepReady = (deep: any) => Boolean(deep?.checked) && Array.isArray(deep?.sections) && deep.sections.length >= 5 && Array.isArray(deep?.vivas) && deep.vivas.length >= 8 && Array.isArray(deep?.exam) && deep.exam.length >= 8;
export default function AdminThinTopics() {
  const db = supabase as unknown as Db;
  const [rows, setRows] = useState<Row[]>([]), [busy, setBusy] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    (async () => {
      const [p, v] = await Promise.all([
        db.from("topic_pages").select("slug,name,category,content,ai_review_status").eq("status", "published").order("updated_at", { ascending: true }).limit(2000),
        db.from("topic_votes").select("slug,vote").limit(20000),
      ]);
      if (!live) return;
      if (p.error) { setError("The topic-page queue could not be read. Check the topic_pages table and its read policy."); setBusy(false); return; }
      const votes = new Map<string, { up: number; down: number }>();
      for (const x of (v.data ?? []) as { slug: string; vote: number }[]) { const c = votes.get(x.slug) ?? { up: 0, down: 0 }; if (x.vote > 0) c.up++; else c.down++; votes.set(x.slug, c); }
      const all = ((p.data ?? []) as any[]).map((r): Row => {
        const content = r.content ?? {};
        return { slug: r.slug, name: r.name, category: r.category, deepReady: isDeepReady(content.deep), aiReviewed: r.ai_review_status === "passed" || content.aiReview?.status === "passed", up: votes.get(r.slug)?.up ?? 0, down: votes.get(r.slug)?.down ?? 0 };
      });
      setRows(all.sort((a, b) => Number(a.deepReady) - Number(b.deepReady) || Number(a.aiReviewed) - Number(b.aiReviewed) || b.down - a.down || a.name.localeCompare(b.name)));
      setBusy(false);
    })().catch(() => { if (live) { setError("The automated topic queue could not be loaded."); setBusy(false); } });
    return () => { live = false; };
  }, [db]);
  const stats = useMemo(() => ({ total: rows.length, deep: rows.filter((r) => r.deepReady).length, verified: rows.filter((r) => r.aiReviewed).length, pending: rows.filter((r) => !r.deepReady).length }), [rows]);
  return <main className="mx-auto max-w-4xl px-5 py-10">
    <Link to="/admin/tools" className="text-sm font-semibold text-primary hover:underline">← Admin tools</Link>
    <h1 className="mt-2 font-serif text-4xl font-bold">Deep exam notes</h1>
    <p className="mt-2 max-w-3xl text-[16px] leading-relaxed text-muted-foreground">This is an automatic completion queue. Groq writes the comprehensive notes; Gemini independently checks them. A page is marked ready only after the required sections, applied questions and independent check are present. Nothing here requires you to write notes manually.</p>
    {busy ? <Loader2 className="mt-8 h-6 w-6 animate-spin text-primary" /> : error ? <p role="alert" className="mt-6 rounded-xl border border-destructive/40 p-4 text-sm text-destructive">{error}</p> : <>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Published topics</p><p className="mt-1 text-2xl font-bold tabular-nums">{stats.total}</p></div>
        <div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Deep notes ready</p><p className="mt-1 text-2xl font-bold tabular-nums">{stats.deep}</p></div>
        <div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Awaiting deep notes</p><p className="mt-1 text-2xl font-bold tabular-nums">{stats.pending}</p></div>
        <div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Gemini verified</p><p className="mt-1 text-2xl font-bold tabular-nums">{stats.verified}</p></div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">The scheduled GitHub queue processes older pages first. If a provider is unavailable or Gemini does not clear a page, it stays pending and is retried; it is never labelled verified prematurely.</p>
      <ul className="mt-6 divide-y divide-border rounded-2xl border border-border">
        {rows.map((r) => <li key={r.slug} className="flex flex-wrap items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><Link to={`/topic/${r.slug}`} className="font-semibold hover:underline">{r.name}</Link><p className="text-sm text-muted-foreground">{r.deepReady ? "Full deep notes ready" : "Queued for automatic deep-note generation"} · {r.aiReviewed ? "Gemini review passed" : "AI review pending"} · 👍 {r.up} · 👎 {r.down}</p></div>{!r.deepReady && <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">In queue</span>}</li>)}
        {!rows.length && <li className="px-4 py-6 text-muted-foreground">No published topic pages yet.</li>}
      </ul>
    </>}
  </main>;
}
