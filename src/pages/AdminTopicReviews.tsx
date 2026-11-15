import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock3, History, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Finding = {
  id: string; article_id: string; section: string; claim: string; verdict: string; severity: string;
  reference: string | null; suggested_fix: string | null; requires_review: boolean; status: string; created_at: string;
};
type Job = { id: string; article_id: string; status: string; run_after: string; loop_count: number; last_error: string | null; created_at: string };
type Revision = { id: string; old_text: unknown; new_text: unknown; reason: string; source: string; created_at: string };

export default function AdminTopicReviews() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [revisions, setRevisions] = useState<Record<string, Revision[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [f, j] = await Promise.all([
      supabase.from("audit_findings").select("id,article_id,section,claim,verdict,severity,reference,suggested_fix,requires_review,status,created_at").eq("status","pending").order("created_at",{ascending:false}).limit(100),
      supabase.from("review_jobs").select("id,article_id,status,run_after,loop_count,last_error,created_at").order("created_at",{ascending:false}).limit(60),
    ]);
    if (f.error || j.error) setMessage(f.error?.message || j.error?.message || "Could not load the review queue.");
    setFindings((f.data || []) as Finding[]);
    setJobs((j.data || []) as Job[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, action: "apply_topic_audit_finding" | "dismiss_topic_audit_finding") => {
    setBusy(id); setMessage("");
    const { data, error } = await supabase.rpc(action, action === "apply_topic_audit_finding" ? { p_finding_id: id } : { p_finding_id: id });
    setBusy(null);
    if (error || !(data as {ok?:boolean})?.ok) setMessage(error?.message || "The action was not applied.");
    else setMessage(action === "apply_topic_audit_finding" ? "Proposed correction applied and revision saved." : "Finding dismissed.");
    await load();
  };

  const showRevisions = async (slug: string) => {
    if (expanded === slug) { setExpanded(null); return; }
    setExpanded(slug);
    if (revisions[slug]) return;
    const { data, error } = await supabase.from("article_revisions").select("id,old_text,new_text,reason,source,created_at").eq("article_id",slug).order("created_at",{ascending:false}).limit(12);
    if (error) setMessage(error.message);
    setRevisions((old) => ({ ...old, [slug]: (data || []) as Revision[] }));
  };

  const critical = findings.filter((f) => f.requires_review);
  const waiting = jobs.filter((j) => j.status === "pending" || j.status === "processing").length;
  const needsReview = jobs.filter((j) => j.status === "needs_review").length;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <Link to="/admin/tools" className="text-sm font-semibold text-primary hover:underline">← Admin tools</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Clinical quality control</p>
          <h1 className="mt-1 font-serif text-4xl font-bold">Topic review queue</h1>
          <p className="mt-2 max-w-3xl text-[16px] leading-relaxed text-muted-foreground">Gemini reviews published topic pages after a five-minute delay. Low- and medium-risk corrections are automatic. High-risk changes to management, medicines, doses, classifications and diagnostic criteria wait for an administrator.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-bold hover:border-primary/50 disabled:opacity-50"><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh</button>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border p-4"><Clock3 className="h-5 w-5 text-primary"/><p className="mt-2 text-2xl font-bold">{waiting}</p><p className="text-sm text-muted-foreground">Waiting / processing</p></div>
        <div className="rounded-xl border border-border p-4"><AlertTriangle className="h-5 w-5 text-amber-600"/><p className="mt-2 text-2xl font-bold">{critical.length}</p><p className="text-sm text-muted-foreground">High-risk decisions awaiting you</p></div>
        <div className="rounded-xl border border-border p-4"><ShieldCheck className="h-5 w-5 text-emerald-600"/><p className="mt-2 text-2xl font-bold">{needsReview}</p><p className="text-sm text-muted-foreground">Pages still requiring review</p></div>
      </div>
      {message && <p role="status" className="mt-4 rounded-lg border border-border p-3 text-sm">{message}</p>}
      <section className="mt-10">
        <h2 className="font-serif text-2xl font-bold">Human decisions required</h2>
        <p className="mt-1 text-sm text-muted-foreground">Review the original claim, the evidence note and the proposed correction before applying it.</p>
        <div className="mt-4 space-y-4">
          {critical.map((f) => (
            <article key={f.id} className="rounded-2xl border border-amber-500/40 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">High-risk · human approval</span>
                <span className="text-xs text-muted-foreground">{f.severity} · {f.verdict}</span>
                <Link to={"/topic/"+f.article_id} className="ml-auto text-sm font-bold text-primary hover:underline">Open topic ↗</Link>
              </div>
              <h3 className="mt-3 text-lg font-bold">{f.article_id} · {f.section}</h3>
              <p className="mt-2 text-[15px] leading-relaxed"><strong>Claim:</strong> {f.claim}</p>
              {f.reference && <p className="mt-2 text-sm text-muted-foreground"><strong>Reference:</strong> {f.reference}</p>}
              {f.suggested_fix && <div className="mt-3 rounded-xl bg-muted/60 p-3"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Proposed correction</p><p className="mt-1 text-[15px] leading-relaxed">{f.suggested_fix}</p></div>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={busy===f.id || !f.suggested_fix} onClick={() => void act(f.id,"apply_topic_audit_finding")} className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy===f.id?"Saving…":"Apply correction"}</button>
                <button type="button" disabled={busy===f.id} onClick={() => void act(f.id,"dismiss_topic_audit_finding")} className="rounded-full border border-border px-5 py-2.5 text-sm font-bold disabled:opacity-50">Dismiss</button>
              </div>
            </article>
          ))}
          {!loading && critical.length===0 && <div className="rounded-xl border border-border p-5 text-muted-foreground"><CheckCircle2 className="mr-2 inline h-5 w-5 text-emerald-600"/>No high-risk findings are awaiting a decision.</div>}
        </div>
      </section>
      <section className="mt-12">
        <h2 className="font-serif text-2xl font-bold">Recent review jobs</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="bg-muted/60"><tr><th className="p-3">Topic</th><th className="p-3">Status</th><th className="p-3">Loops</th><th className="p-3">Scheduled</th><th className="p-3">History</th></tr></thead>
            <tbody>{jobs.map((j) => <tr key={j.id} className="border-t border-border"><td className="p-3 font-semibold"><Link to={"/topic/"+j.article_id} className="hover:text-primary hover:underline">{j.article_id}</Link>{j.last_error && <p className="mt-1 max-w-sm text-xs text-destructive">{j.last_error}</p>}</td><td className="p-3">{j.status.replace("_"," ")}</td><td className="p-3 tabular-nums">{j.loop_count}/2</td><td className="p-3 text-muted-foreground">{new Date(j.run_after).toLocaleString()}</td><td className="p-3"><button type="button" onClick={() => void showRevisions(j.article_id)} className="inline-flex items-center gap-1 text-primary hover:underline"><History className="h-4 w-4"/> Revisions</button></td></tr>)}</tbody>
          </table>
          {!loading && jobs.length===0 && <p className="p-4 text-sm text-muted-foreground">No topic review jobs yet. Newly published pages enter the queue automatically.</p>}
        </div>
        {expanded && <div className="mt-4 rounded-xl border border-border p-4"><h3 className="font-bold">Revision history · {expanded}</h3>{(revisions[expanded]||[]).map((r)=><article key={r.id} className="mt-3 border-t border-border pt-3"><p className="text-sm font-semibold">{r.reason}</p><p className="text-xs text-muted-foreground">{r.source} · {new Date(r.created_at).toLocaleString()}</p><details className="mt-2"><summary className="cursor-pointer text-sm text-primary">View saved before/after data</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs">{JSON.stringify({before:r.old_text,after:r.new_text},null,2)}</pre></details></article>)}{(revisions[expanded]||[]).length===0 && <p className="mt-2 text-sm text-muted-foreground">No revisions recorded for this topic.</p>}</div>}
      </section>
    </main>
  );
}
