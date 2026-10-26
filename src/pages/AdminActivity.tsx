import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminErrors from "@/components/AdminErrors";

type Db = { from: (t: string) => any; rpc: (f: string, a?: Record<string, unknown>) => Promise<{ data: any; error: unknown }> };
const MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
const passed = (n: number) => [...MILESTONES].reverse().find((m) => n >= m) ?? 0;
interface Key { provider: string; ok: boolean; status: number; tail: string }

/** /admin/activity: what students search and ask, the state of the AI keys, and the queues that wait for the admin. */
export default function AdminActivity() {
  const db = supabase as unknown as Db;
  const [busy, setBusy] = useState(true);
  const [top, setTop] = useState<{ q: string; n: number; none: number }[]>([]);
  const [days, setDays] = useState<{ d: string; n: number }[]>([]);
  const [counts, setCounts] = useState<{ drafts: number | null; polish: Record<string, number> }>({ drafts: null, polish: {} });
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [keyMsg, setKeyMsg] = useState("");
  const [growth, setGrowth] = useState<{ accounts: number; newWeek: number; visitors: number; online: number } | null>(null);
  const [party, setParty] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [all, fresh, stats] = await Promise.all([
        db.from("profiles").select("user_id", { count: "exact", head: true }),
        db.from("profiles").select("user_id", { count: "exact", head: true }).gte("created_at", weekAgo),
        db.rpc("admin_site_stats", { p_days: 7 }),
      ]);
      const g = { accounts: all.count ?? 0, newWeek: fresh.count ?? 0, visitors: Number(stats.data?.totals?.visitors ?? 0), online: Number(stats.data?.online?.total ?? 0) };
      setGrowth(g);
      // congratulate once for each round number passed (remembered on this device)
      try {
        const seen = JSON.parse(localStorage.getItem("ompath_milestones") ?? "{}") as Record<string, number>;
        const notes: string[] = [];
        const a = passed(g.accounts); if (a > (seen.accounts ?? 0)) { notes.push(`Congratulations! ${a.toLocaleString()} people now have an account on Ompath Study.`); seen.accounts = a; }
        const v = passed(g.visitors); if (v > (seen.visitors ?? 0)) { notes.push(`Congratulations! ${v.toLocaleString()} different people visited in the last 7 days.`); seen.visitors = v; }
        localStorage.setItem("ompath_milestones", JSON.stringify(seen));
        setParty(notes);
      } catch { /* storage blocked */ }
    })();
  }, [db]);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const s = await db.from("search_queries").select("normalized_query,results_count,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(3000);
      const by = new Map<string, { n: number; none: number }>(); const perDay = new Map<string, number>();
      for (const r of (s.data ?? []) as { normalized_query: string; results_count: number; created_at: string }[]) {
        const q = (r.normalized_query ?? "").trim(); if (q.length < 3) continue;
        const e = by.get(q) ?? { n: 0, none: 0 }; e.n++; if (!r.results_count) e.none++; by.set(q, e);
        const d = r.created_at.slice(0, 10); perDay.set(d, (perDay.get(d) ?? 0) + 1);
      }
      setTop([...by.entries()].map(([q, v]) => ({ q, ...v })).sort((a, b) => b.n - a.n).slice(0, 25));
      setDays([...perDay.entries()].map(([d, n]) => ({ d, n })).sort((a, b) => a.d.localeCompare(b.d)));
      const dr = await db.from("ai_drafts").select("id", { count: "exact", head: true }).eq("status", "pending");
      const pol = await db.from("blog_polish").select("status").limit(3000);
      const pc: Record<string, number> = {}; for (const r of (pol.data ?? []) as { status: string }[]) pc[r.status] = (pc[r.status] ?? 0) + 1;
      setCounts({ drafts: dr.error ? null : dr.count ?? 0, polish: pc });
      setBusy(false);
    })();
  }, [db]);

  const checkKeys = async () => {
    setKeyMsg("Checking…");
    const { data } = await db.from("polish_secret").select("secret").maybeSingle();
    if (!data?.secret) { setKeyMsg("Make the polish key first on /admin/polish."); return; }
    try {
      const r = await fetch("/api/ai?task=health", { headers: { "x-polish-key": data.secret } });
      if (!r.ok) { setKeyMsg("The server did not accept the key. Is POLISH_WRITE_KEY in Vercel the same value?"); return; }
      setKeys(((await r.json()) as { keys: Key[] }).keys); setKeyMsg("");
    } catch { setKeyMsg("Could not reach the server."); }
  };

  const max = Math.max(1, ...days.map((d) => d.n));
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link to="/admin/tools" className="text-sm font-semibold text-primary hover:underline">← Admin tools</Link>
      <h1 className="mt-2 font-serif text-4xl font-bold">Activity</h1>
      <p className="mt-2 text-[16px] text-muted-foreground">What students searched this week, which searches found nothing, the AI keys, and what is waiting for you. Who visits and when is on <Link to="/admin/analytics" className="font-semibold text-primary hover:underline">Visitors</Link>.</p>
      <AdminErrors />
      {party.map((p) => (
        <div key={p} role="status" className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-amber-400/50 bg-gradient-to-r from-amber-400/20 via-amber-300/10 to-transparent p-4"><p className="font-serif text-lg font-bold">🎉 {p}</p><button type="button" onClick={() => setParty((x) => x.filter((y) => y !== p))} className="text-xs font-bold text-muted-foreground hover:text-foreground">Thanks</button></div>
      ))}
      {growth && (
        <section className="mt-6 grid gap-3 sm:grid-cols-4" aria-label="Growth">
          <div className="rounded-xl border border-border p-4"><p className="text-3xl font-bold text-primary">{growth.accounts.toLocaleString()}</p><p className="text-sm text-muted-foreground">accounts (signed up)</p></div>
          <div className="rounded-xl border border-border p-4"><p className="text-3xl font-bold text-primary">+{growth.newWeek.toLocaleString()}</p><p className="text-sm text-muted-foreground">new accounts this week</p></div>
          <div className="rounded-xl border border-border p-4"><p className="text-3xl font-bold text-primary">{growth.visitors.toLocaleString()}</p><p className="text-sm text-muted-foreground">different visitors, 7 days</p></div>
          <div className="rounded-xl border border-border p-4"><p className="text-3xl font-bold text-primary">{growth.online.toLocaleString()}</p><p className="text-sm text-muted-foreground">online right now</p></div>
        </section>
      )}
      {growth && <p className="mt-2 text-xs text-muted-foreground">A visitor is one network address per week, so the same laptop in two browsers counts once. People sharing a campus network can count as one.</p>}
      {busy ? <Loader2 className="mt-8 h-6 w-6 animate-spin text-primary" /> : (
        <>
          <section className="mt-8 grid gap-3 sm:grid-cols-3" aria-label="Waiting">
            <Link to="/admin/drafts" className="rounded-xl border border-border p-4 hover:border-primary/60"><p className="text-3xl font-bold text-primary">{counts.drafts ?? "—"}</p><p className="text-sm text-muted-foreground">AI notes to approve</p></Link>
            <Link to="/admin/polish" className="rounded-xl border border-border p-4 hover:border-primary/60"><p className="text-3xl font-bold text-primary">{counts.polish.done ?? 0}</p><p className="text-sm text-muted-foreground">blogs polished ({counts.polish.partial ?? 0} part-way)</p></Link>
            <div className="rounded-xl border border-border p-4"><p className="text-3xl font-bold text-primary">{days.reduce((a, d) => a + d.n, 0)}</p><p className="text-sm text-muted-foreground">searches in 7 days</p></div>
          </section>

          <section className="mt-10" aria-label="Searches per day">
            <h2 className="font-serif text-2xl font-bold">Searches per day</h2>
            <div className="mt-3 flex h-28 items-end gap-1.5">{days.map((d) => <div key={d.d} className="flex flex-1 flex-col items-center gap-1"><div className="w-full rounded-t bg-primary/70" style={{ height: `${Math.max(4, (d.n / max) * 100)}%` }} title={`${d.d}: ${d.n}`} /><span className="text-[10px] text-muted-foreground">{d.d.slice(8)}</span></div>)}</div>
          </section>

          <section className="mt-10" aria-label="Top searches">
            <h2 className="font-serif text-2xl font-bold">What they searched</h2>
            <p className="text-sm text-muted-foreground">Searches that found nothing are the notes to write next.</p>
            <ul className="mt-3 divide-y divide-border">{top.map((t) => <li key={t.q} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0 truncate font-semibold">{t.q}</span><span className="shrink-0 text-sm text-muted-foreground">{t.n}×{t.none ? <b className="ml-2 text-destructive">{t.none} found nothing</b> : null}</span></li>)}</ul>
          </section>
        </>
      )}

      <section className="mt-10" aria-label="AI keys">
        <h2 className="font-serif text-2xl font-bold">AI keys</h2>
        <p className="text-sm text-muted-foreground">Checks each key the live site uses without spending any of the AI quota.</p>
        <button type="button" onClick={() => void checkKeys()} className="mt-3 h-11 rounded-full bg-primary px-6 font-bold text-primary-foreground">Check the keys</button>
        {keyMsg && <p className="mt-2 text-sm text-muted-foreground" role="status">{keyMsg}</p>}
        {keys && <ul className="mt-3 space-y-1.5">{keys.map((k, i) => <li key={i} className="flex items-center gap-3 text-sm"><span className={`h-2.5 w-2.5 rounded-full ${k.ok ? "bg-emerald-500" : "bg-destructive"}`} aria-hidden /><b>{k.provider}</b> …{k.tail}<span className="text-muted-foreground">{k.ok ? "works" : `not working (${k.status || "no answer"})`}</span></li>)}{keys.length === 0 && <li className="text-sm text-destructive">No AI keys are set on the server.</li>}</ul>}
      </section>
    </main>
  );
}
