import { useCallback, useEffect, useState } from "react";
import { Bot, Check, Loader2, Play, RotateCcw, X } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import AdminAgent from "@/components/AdminAgent";

type Mode = "off" | "ask" | "auto";
interface Cap { key: string; title: string; description: string; mode: Mode }
interface Proposal { id: string; at: string; summary: string }
interface LogRow { id: string; at: string; capability: string; summary: string; undo: unknown; undone_at: string | null }
const db = supabase as any;
const MODES: { id: Mode; label: string; hint: string }[] = [{ id: "off", label: "Off", hint: "Does nothing" }, { id: "ask", label: "Ask me", hint: "Finds things and waits for your Yes" }, { id: "auto", label: "Auto", hint: "Does it, logs it, you can undo" }];
const when = (iso: string) => new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Nairobi" }).format(new Date(iso));

/** /admin/autopilot: what the site does by itself, a switch for each job, what is waiting for you, and a log with undo. */
export default function AdminAutopilot() {
  const [caps, setCaps] = useState<Cap[]>([]);
  const [queue, setQueue] = useState<Proposal[]>([]);
  const [log, setLog] = useState<LogRow[]>([]);
  const [status, setStatus] = useState<{ scheduled: boolean; last_run_at: string | null } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [installed, setInstalled] = useState(true);

  const load = useCallback(async () => {
    const [c, q, l, s] = await Promise.all([
      db.from("agent_capabilities").select("key,title,description,mode").order("sort"),
      db.from("agent_proposals").select("id,at,summary").eq("status", "pending").order("at", { ascending: false }),
      db.from("agent_log").select("id,at,capability,summary,undo,undone_at").order("at", { ascending: false }).limit(40),
      db.rpc("admin_agent_status"),
    ]);
    if (c.error) { setInstalled(false); return; }
    setCaps(c.data || []); setQueue(q.data || []); setLog(l.data || []); setStatus(s.data || null);
  }, []);

  useEffect(() => { void (async () => { try { await db.rpc("admin_agent_run"); } catch { /* not installed yet */ } await load(); })(); }, [load]);

  async function act(key: string, work: () => Promise<{ error: { message: string } | null }>) {
    setBusy(key); setError("");
    const r = await work();
    if (r.error) setError(r.error.message);
    await load(); setBusy("");
  }

  if (!installed) return <div className="mx-auto max-w-2xl px-5 py-10"><h1 className="font-serif text-3xl font-bold">Autopilot</h1><p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">Autopilot is not installed yet. Run <strong>20261016160000_autopilot.sql</strong> (it is on your Desktop as <strong>autopilot.sql</strong>) in the Lovable SQL editor, then refresh this page.</p></div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-5 py-8">
      <Helmet><title>Autopilot | Admin</title><meta name="robots" content="noindex" /></Helmet>
      <header>
        <h1 className="flex items-center gap-3 font-serif text-3xl font-bold"><Bot className="h-7 w-7 text-primary" /> Autopilot</h1>
        <p className="mt-2 text-sm text-muted-foreground">Jobs the site does for you. Each has its own switch. Nothing is ever deleted, and everything it does is listed below with an Undo.</p>
        <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{status?.scheduled ? "Runs every hour." : "Runs whenever an admin page is open (no hourly schedule on this database)."}</span>
          {status?.last_run_at && <span>Last run {when(status.last_run_at)}</span>}
          <button type="button" disabled={busy === "run"} onClick={() => void act("run", () => db.rpc("admin_agent_run"))} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-semibold text-foreground hover:bg-muted">{busy === "run" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Run now</button>
        </p>
      </header>
      {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p>}

      <AdminAgent />

      {queue.length > 0 && (
        <section className="rounded-2xl border border-primary/40 bg-primary/5 p-4" aria-label="Waiting for you">
          <div className="flex items-center justify-between gap-3"><h2 className="font-bold">Waiting for you ({queue.length})</h2>
            {queue.length > 1 && <button type="button" disabled={Boolean(busy)} onClick={() => void (async () => { setBusy("all"); for (const p of queue) await db.rpc("admin_agent_decide", { p_id: p.id, p_approve: true }); await load(); setBusy(""); })()} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">Approve all</button>}
          </div>
          <ul className="mt-3 space-y-2">
            {queue.map((p) => (
              <li key={p.id} className="flex items-start gap-3 rounded-xl border bg-card p-3 text-sm">
                <span className="min-w-0 flex-1">{p.summary}<span className="mt-0.5 block text-xs text-muted-foreground">{when(p.at)}</span></span>
                <button type="button" aria-label="Approve" disabled={Boolean(busy)} onClick={() => void act(p.id, () => db.rpc("admin_agent_decide", { p_id: p.id, p_approve: true }))} className="rounded-lg bg-primary p-2 text-primary-foreground"><Check className="h-4 w-4" /></button>
                <button type="button" aria-label="Dismiss" disabled={Boolean(busy)} onClick={() => void act(p.id, () => db.rpc("admin_agent_decide", { p_id: p.id, p_approve: false }))} className="rounded-lg border p-2"><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Jobs" className="space-y-3">
        {caps.map((c) => (
          <div key={c.key} className="rounded-2xl border bg-card p-4">
            <h2 className="font-bold">{c.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
            <div className="mt-3 inline-flex overflow-hidden rounded-lg border" role="group" aria-label={`${c.title} mode`}>
              {MODES.map((m) => <button key={m.id} type="button" title={m.hint} disabled={busy === c.key} onClick={() => void act(c.key, () => db.rpc("admin_agent_set_mode", { p_key: c.key, p_mode: m.id }))} className={`px-4 py-2 text-sm font-semibold ${c.mode === m.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{m.label}</button>)}
            </div>
          </div>
        ))}
      </section>

      <section aria-label="Log">
        <h2 className="font-bold">What it did</h2>
        {!log.length ? <p className="mt-2 text-sm text-muted-foreground">Nothing yet.</p> : (
          <ul className="mt-3 divide-y rounded-2xl border">
            {log.map((l) => (
              <li key={l.id} className="flex items-start gap-3 p-3 text-sm">
                <span className="min-w-0 flex-1"><span className={l.undone_at ? "text-muted-foreground line-through" : ""}>{l.summary}</span><span className="mt-0.5 block text-xs text-muted-foreground">{when(l.at)}{l.undone_at ? " · undone" : ""}</span></span>
                {Boolean(l.undo) && !l.undone_at && <button type="button" disabled={Boolean(busy)} onClick={() => void act(l.id, () => db.rpc("admin_agent_undo", { p_log_id: l.id }))} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold hover:bg-muted"><RotateCcw className="h-3 w-3" /> Undo</button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
