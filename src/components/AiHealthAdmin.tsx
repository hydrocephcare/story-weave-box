import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { clearAiFailures, loadAiFailures, markAiFailuresSeen, type AiFailure } from "@/lib/aiHealth";

type RuntimeHealth = { checkedAt: string; checks: Record<string, any> };
const KIND: Record<string, string> = { answer: "AI answer", search: "Search", quiz: "Quiz", essay: "Essays", paper: "Paper", drill: "Anatomy drill", other: "Other" };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Admin: the times Ompath AI failed for a student, and what the student saw instead. */
export default function AiHealthAdmin() {
  const [rows, setRows] = useState<AiFailure[] | null>(null);
  const [runtime, setRuntime] = useState<RuntimeHealth | null>(null);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [runtimeError, setRuntimeError] = useState("");
  const load = useCallback(async () => { setRows(null); setRows(await loadAiFailures(150)); markAiFailuresSeen(); window.dispatchEvent(new Event("ompath:ai-health")); }, []);
  const loadRuntime = useCallback(async () => {
    setRuntimeBusy(true); setRuntimeError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in with the administrator account first.");
      const response = await fetch("/api/ai?task=runtimeHealth&deep=1", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Backend check failed (${response.status}).`);
      setRuntime(data as RuntimeHealth);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : "Could not run backend checks.");
    } finally { setRuntimeBusy(false); }
  }, []);
  useEffect(() => { void load(); void loadRuntime(); }, [load, loadRuntime]);

  const day = useMemo(() => (rows ?? []).filter((r) => Date.now() - Date.parse(r.created_at) < 86_400_000).length, [rows]);
  const byKind = useMemo(() => { const m = new Map<string, number>(); (rows ?? []).forEach((r) => m.set(r.kind, (m.get(r.kind) ?? 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [rows]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-serif text-lg font-bold">Backend readiness</h3>
            <p className="text-xs text-muted-foreground">Live checks for Neon, search access, AI providers, Paystack and automatic publishing dependencies.</p>
          </div>
          <Button variant="outline" size="sm" disabled={runtimeBusy} onClick={() => void loadRuntime()}><RefreshCw className={`mr-1.5 h-4 w-4 ${runtimeBusy ? "animate-spin" : ""}`} /> Check backend</Button>
        </div>
        {runtimeError && <p className="text-sm text-destructive">{runtimeError}</p>}
        {!runtime && !runtimeError && <p className="text-sm text-muted-foreground">Run the checks to inspect production readiness.</p>}
        {runtime && (() => {
          const c = runtime.checks || {};
          const checks = [
            ["Neon database", c.neonDatabase?.ok && c.neonDatabase?.connected],
            ["Neon user identity", c.userIdentity?.ok && c.userIdentity?.ready && (c.userIdentity?.skipped || 0) === 0],
            ["Search Data API", c.searchDataApi?.ok && c.searchDataApi?.connected],
            ["Neon Auth keys", c.authJwks?.ok && c.authJwks?.reachable],
            ["AI entitlements", c.entitlements?.ok && c.entitlements?.ready],
            ["Main XML sitemap", c.mainSitemap?.ok && c.mainSitemap?.ready],
            ["Stories XML sitemap", c.storiesSitemap?.ok && c.storiesSitemap?.ready],
            ["Main crawler metadata", c.crawlerMetadata?.ok && c.crawlerMetadata?.ready],
            ["Stories crawler metadata", c.storiesCrawlerMetadata?.ok && c.storiesCrawlerMetadata?.ready],
            ["SEO share-card renderer", c.noteCard?.ok && c.noteCard?.ready],
            ["Groq", c.groq?.ok && c.groq?.reachable],
            ["Gemini", c.gemini?.ok && c.gemini?.reachable],
            ["Paystack API", c.paystack?.ok && c.paystack?.reachable],
            ["Paystack webhook route", c.paystackWebhook?.ok && c.paystackWebhook?.ready],
            ["Student library access", c.mkuStudentAccess?.ok && c.mkuStudentAccess?.endpointReachable && c.mkuStudentAccess?.currentAdminAllowed],
            ["Email delivery", c.resend?.ok && c.resend?.reachable],
            ["Blog polish secret", c.polish?.ok && c.polish?.databaseSecretMatchesRuntime && c.polish?.aiKeysConfigured],
            ["Paystack enabled", c.payments?.ok && c.payments?.enabled],
            ["Topic publishing RPC", c.schema?.ok && c.schema?.topic_publish_rpc],
            ["Deep-note RPC", c.schema?.ok && c.schema?.topic_deep_rpc],
          ] as [string, boolean][];
          return <>
            <div className="grid gap-2 sm:grid-cols-2">
              {checks.map(([label, ok]) => <div key={label} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                {ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />}
                <span>{label}</span><span className="ml-auto text-xs font-semibold text-muted-foreground">{ok ? "Ready" : "Needs attention"}</span>
              </div>)}
            </div>
            <p className="text-[11px] text-muted-foreground">Checked {when(runtime.checkedAt)}. These checks verify connectivity and credentials; they do not charge a payment or publish a test article.</p>
          </>;
        })()}
      </section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-serif text-xl font-bold text-foreground">AI health</h2>
          <p className="text-sm text-muted-foreground">Every time Ompath AI could not answer, it is listed here. The student still got a fallback: the matching notes, the site library, or a quick link.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-1.5 h-4 w-4" /> Refresh</Button>
          {rows && rows.length > 0 && <Button variant="outline" size="sm" onClick={async () => { if (window.confirm("Clear the whole list?") && (await clearAiFailures())) setRows([]); }}><Trash2 className="mr-1.5 h-4 w-4" /> Clear</Button>}
        </div>
      </div>

      {rows === null ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
        : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-5 text-sm">
            <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> No AI failures recorded.</p>
            <p className="mt-2 text-muted-foreground">If you expected some, make sure the <code>ai_failures</code> table exists: run <code>supabase/migrations/20261009120000_ompath_ai_failures.sql</code> once in the Supabase SQL editor.</p>
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-3"><p className="text-2xl font-bold">{day}</p><p className="text-xs text-muted-foreground">in the last 24 hours</p></div>
              <div className="rounded-xl border border-border bg-card p-3"><p className="text-2xl font-bold">{rows.length}</p><p className="text-xs text-muted-foreground">recorded in total</p></div>
              <div className="rounded-xl border border-border bg-card p-3"><p className="text-sm font-semibold">{byKind.map(([k, n]) => `${KIND[k] ?? k} ${n}`).join(" · ")}</p><p className="text-xs text-muted-foreground">by feature</p></div>
            </div>
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-destructive"><AlertTriangle className="h-3 w-3" /> {KIND[r.kind] ?? r.kind}</span>
                    <span className="text-muted-foreground">{when(r.created_at)}</span>
                    {r.page && <span className="text-muted-foreground">on {r.page}</span>}
                  </div>
                  {r.question && <p className="mt-1.5 font-semibold">“{r.question}”</p>}
                  {r.message && <p className="mt-0.5 text-xs text-muted-foreground">{r.message}</p>}
                  {r.fallback && <p className="mt-1 text-xs"><span className="font-semibold">Student saw:</span> {r.fallback}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
    </div>
  );
}
