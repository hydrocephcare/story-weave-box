import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, RefreshCw, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { drawStatsCard, type StatsDay } from "@/lib/statsCard";
import { cn } from "@/lib/utils";
import AggregateEngagement from "@/components/admin/AggregateEngagement";

interface Stats {
  days: number; since: string;
  online: { total: number; members: number; paths: { path: string; n: number }[] };
  totals: { visitors: number; members: number; views: number };
  today: { visitors: number; members: number; views: number };
  daily: StatsDay[];
  top: { path: string; views: number; visitors: number }[];
  devices: { device: string; visitors: number }[];
  returning: number;
  newVisitors?: number;
  returningRate?: number;
  sessions?: number;
  repeatSessionVisitors?: number;
  repeatSessionRate?: number;
  avgPagesPerVisitor?: number;
  accounts?: { total: number; active: number };
}
const PERIODS = [{ k: "today", label: "Today", days: 1 }, { k: "week", label: "This week", days: 7 }, { k: "month", label: "This month", days: 30 }, { k: "year", label: "This year", days: 365 }] as const;
const n = (x: number) => x.toLocaleString("en-US");

async function fetchStats(days: number): Promise<Stats | null> {
  const { data, error } = await (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: Stats | null; error: unknown }> }).rpc("admin_site_stats", { p_days: days });
  return error ? null : data;
}

/** One shareable picture for one period (today, this week, this month, this year), drawn from that period's own numbers. */
function ShareCard({ period }: { period: (typeof PERIODS)[number] }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let on = true;
    void fetchStats(period.days).then((st) => {
      if (!on || !st || !canvas.current) return;
      const a = new Date(`${st.since}T00:00:00`), b = new Date();
      const f = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      drawStatsCard(canvas.current, { label: period.label, range: period.days === 1 ? f(b) : `${f(a)} to ${f(b)}`, visitors: st.totals.visitors, members: st.totals.members, views: st.totals.views, returning: st.returning, daily: st.daily });
      setReady(true);
    });
    return () => { on = false; };
  }, [period]);
  const blob = () => new Promise<Blob | null>((res) => canvas.current?.toBlob((x) => res(x), "image/png"));
  const download = async () => { const x = await blob(); if (!x) return; const el = document.createElement("a"); el.href = URL.createObjectURL(x); el.download = `ompath-study-${period.k}.png`; el.click(); setTimeout(() => URL.revokeObjectURL(el.href), 2000); };
  const share = async () => {
    const x = await blob(); if (!x) return;
    const file = new File([x], `ompath-study-${period.k}.png`, { type: "image/png" });
    try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: "Ompath Study", text: `${period.label} on Ompath Study` }); return; } } catch { return; }
    void download();
  };
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-primary">{period.label}</figcaption>
      <canvas ref={canvas} className={cn("w-full max-w-sm rounded-2xl shadow-lg transition-opacity", ready ? "opacity-100" : "opacity-30")} aria-label={`Picture for ${period.label.toLowerCase()}`} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={download} disabled={!ready} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-40"><Download className="h-4 w-4" aria-hidden /> Download</button>
        <button type="button" onClick={share} disabled={!ready} className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-5 text-sm font-bold hover:border-primary/60 disabled:opacity-40"><Share2 className="h-4 w-4" aria-hidden /> Share</button>
      </div>
    </figure>
  );
}

/** Admin: who is on the site now, how many used it each day, and a picture of the numbers to share. */
export default function AdminAnalytics() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(PERIODS[0]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  const load = useCallback(async (days: number, quiet = false) => {
    if (!quiet) setLoading(true);
    const { data, error: e } = await (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: Stats | null; error: { message: string; code?: string } | null }> }).rpc("admin_site_stats", { p_days: days });
    if (e) setError(e.code === "PGRST202" || /could not find the function/i.test(e.message) ? "setup" : e.message); else { setError(""); setStats(data); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(period.days); }, [period, load]);
  // who is online: refreshed every half minute
  useEffect(() => { const t = window.setInterval(() => void load(period.days, true), 30_000); return () => window.clearInterval(t); }, [period, load]);

  const range = useMemo(() => {
    if (!stats) return "";
    const a = new Date(`${stats.since}T00:00:00`), b = new Date();
    const f = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    return `${f(a)} to ${f(b)}`;
  }, [stats]);

  useEffect(() => {
    if (!stats || !canvas.current) return;
    drawStatsCard(canvas.current, { label: period.label, range, visitors: stats.totals.visitors, members: stats.totals.members, views: stats.totals.views, returning: stats.returning, daily: stats.daily });
  }, [stats, period, range]);

  const blob = () => new Promise<Blob | null>((res) => canvas.current?.toBlob((b) => res(b), "image/png"));
  const download = async () => { const b = await blob(); if (!b) return; const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `ompath-study-${period.k}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const share = async () => {
    const b = await blob(); if (!b) return;
    const file = new File([b], `ompath-study-${period.k}.png`, { type: "image/png" });
    try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: "Ompath Study", text: `${period.label} on Ompath Study` }); return; } } catch { return; }
    void download();
  };

  const maxDay = Math.max(1, ...(stats?.daily.map((d) => d.visitors) ?? [1]));
  return (
    <main className="mx-auto min-w-0 max-w-4xl px-4 py-5 sm:px-5 sm:py-10">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Admin</p>
      <h1 className="mt-1 font-serif text-3xl font-bold sm:text-4xl">Visitors & usage</h1>

      {error === "setup" ? (
        <div className="mt-8 max-w-2xl text-[16px] leading-relaxed text-foreground/85">
          <p className="font-serif text-2xl font-bold">One step to switch this on</p>
          <p className="mt-3">Counting needs a few tables in the database. Open the Supabase SQL editor, paste the contents of <strong>supabase/migrations/20261013170000_site_analytics_and_voice.sql</strong> from the project, and run it once. Visits are counted from that moment, and this page fills in.</p>
        </div>
      ) : error ? <p className="mt-6 text-destructive">{error}</p> : null}

      {stats && !error && (
        <>
          <section className="mt-8" aria-label="Online now">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span> Online now</p>
            <p className="mt-2 font-serif text-5xl font-bold leading-none sm:text-6xl">{n(stats.online.total)}</p>
            <p className="mt-2 text-[15px] text-muted-foreground sm:text-[16px]">{n(stats.online.members)} signed in · {n(stats.online.total - stats.online.members)} guests · seen in the last 5 minutes</p>
          </section>


          <AggregateEngagement />

          <div className="-mx-4 mt-8 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:mt-10 sm:flex-wrap sm:overflow-visible sm:px-0" role="group" aria-label="Period">
            {PERIODS.map((p) => <button key={p.k} type="button" onClick={() => setPeriod(p)} className={cn("h-10 shrink-0 rounded-full border px-4 text-sm font-bold sm:px-5", p.k === period.k ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/60")}>{p.label}</button>)}
            <button type="button" onClick={() => void load(period.days)} aria-label="Refresh" className="ml-1 p-2 text-muted-foreground hover:text-primary">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</button>
          </div>

          <section className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6 sm:gap-x-6 sm:gap-y-6" aria-label="Visitor breakdown">
            {[
              ["Unique identities", stats.totals.visitors],
              ["First-time identities", stats.newVisitors ?? Math.max(0, stats.totals.visitors - stats.returning)],
              ["Returning identities", stats.returning],
              ["Signed-in accounts", stats.totals.members],
              ["Guest browsers", Math.max(0, stats.totals.visitors - stats.totals.members)],
              ["Page views", stats.totals.views],
            ].map(([label, value]) => (
              <div key={label as string}>
                <p className="font-serif text-3xl font-bold sm:text-4xl">{n(value as number)}</p>
                <p className="text-sm text-muted-foreground">{label}</p>
                {label === "Returning identities" && <p className="mt-1 text-xs text-muted-foreground">{(stats.returningRate ?? (stats.totals.visitors ? stats.returning / stats.totals.visitors * 100 : 0)).toFixed(1)}% of visitors</p>}
              </div>
            ))}
          </section>
          {stats.accounts && <p className="mt-3 text-sm text-muted-foreground">{n(stats.accounts.active)} of {n(stats.accounts.total)} accounts signed in during this period. Signed-in students are deduplicated by account across their devices.</p>}
          <p className="mt-2 text-xs text-muted-foreground">Guest visitors are counted by browser identity, not verified human identity. A guest using multiple browsers or devices may be counted more than once; clearing browser storage can also create a new visitor identity.</p>
          {stats.since < "2026-10-29" && <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground">Counts before 29 October are approximate: older records merged some guests on shared networks. New signed-in visitors are counted by account; new guests are counted by browser.</p>}
          <p className="mt-3 text-sm text-muted-foreground">Today: {n(stats.today.visitors)} unique visitor identities, {n(stats.today.members)} signed-in accounts, {n(stats.today.views)} page views.</p>
          <p className="mt-1 text-sm text-muted-foreground">Selected period: {n(stats.newVisitors ?? Math.max(0, stats.totals.visitors - stats.returning))} first-time visitors · {n(stats.returning)} returning visitors · {(stats.returningRate ?? (stats.totals.visitors ? stats.returning / stats.totals.visitors * 100 : 0)).toFixed(1)}% returning rate.</p>
          <section className="mt-6 rounded-xl border border-border p-4 sm:p-5" aria-label="Session behaviour">
            <h2 className="font-serif text-xl font-bold">Repeat visits and sessions</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sessions are estimated using a 30-minute period of inactivity between visits.</p>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div><p className="font-serif text-2xl font-bold">{n(stats.sessions ?? 0)}</p><p className="text-sm text-muted-foreground">Sessions</p></div>
              <div><p className="font-serif text-2xl font-bold">{n(stats.repeatSessionVisitors ?? 0)}</p><p className="text-sm text-muted-foreground">Visitors with multiple sessions</p></div>
              <div><p className="font-serif text-2xl font-bold">{(stats.repeatSessionRate ?? 0).toFixed(1)}%</p><p className="text-sm text-muted-foreground">Multiple-session rate</p></div>
              <div><p className="font-serif text-2xl font-bold">{(stats.avgPagesPerVisitor ?? (stats.totals.visitors ? stats.totals.views / stats.totals.visitors : 0)).toFixed(2)}</p><p className="text-sm text-muted-foreground">Pages per visitor</p></div>
            </div>
          </section>

          <section className="mt-10" aria-label="Each day">
            <h2 className="font-serif text-xl font-bold sm:text-2xl">Each day</h2>
            {stats.daily.length === 0 ? <p className="mt-3 text-muted-foreground">No visits counted yet.</p> : (
              stats.daily.length === 1 ? <p className="mt-3 text-[15px] text-muted-foreground">{n(stats.daily[0].visitors)} visitors today. Pick “This week” to see each day side by side.</p> : (
              <div className="mt-4 flex h-44 items-end justify-center gap-1 sm:gap-[3px]" role="img" aria-label="Visitors per day">
                {stats.daily.map((d) => <div key={d.day} title={`${d.day}: ${d.visitors} visitors`} className="flex h-full max-w-14 flex-1 flex-col justify-end"><span className="mb-1 text-center text-[10px] font-semibold text-muted-foreground">{stats.daily.length <= 14 ? d.visitors : ""}</span><div className="min-w-[3px] rounded-t bg-primary/80 hover:bg-primary" style={{ height: `${Math.max(3, (d.visitors / maxDay) * 85)}%` }} /></div>)}
              </div>
              )
            )}
          </section>

          <div className="mt-10 grid gap-8 sm:grid-cols-2 sm:gap-10">
            <section aria-label="Busiest pages" className="min-w-0"><h2 className="font-serif text-2xl font-bold">Busiest pages</h2><ul className="mt-3 space-y-2">{stats.top.map((t) => <li key={t.path} className="flex items-baseline justify-between gap-3 text-[15px]"><span className="min-w-0 truncate font-medium">{t.path}</span><span className="shrink-0 text-muted-foreground">{n(t.views)}</span></li>)}</ul></section>
            <section aria-label="Devices" className="min-w-0"><h2 className="font-serif text-2xl font-bold">Page views by device</h2><ul className="mt-3 space-y-2">{stats.devices.map((t) => <li key={t.device} className="flex items-baseline justify-between text-[15px] capitalize"><span>{t.device}</span><span className="text-muted-foreground">{n(t.visitors)} page views</span></li>)}</ul></section>
          </div>

          <section className="mt-12" aria-label="Pictures to share">
            <h2 className="font-serif text-2xl font-bold">Pictures to share</h2>
            <p className="mt-1 text-[15px] text-muted-foreground">One for today, this week, this month and this year, made from the live numbers. Download one, or send it straight to WhatsApp.</p>
            <div className="mt-5 grid gap-8 sm:grid-cols-2">
              {PERIODS.map((p) => <ShareCard key={p.k} period={p} />)}
            </div>
          </section>
        </>
      )}
      {loading && !stats && !error && <p className="mt-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
    </main>
  );
}
