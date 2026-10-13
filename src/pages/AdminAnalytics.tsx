import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, RefreshCw, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { drawStatsCard, type StatsDay } from "@/lib/statsCard";
import { cn } from "@/lib/utils";

interface Stats {
  days: number; since: string;
  online: { total: number; members: number; paths: { path: string; n: number }[] };
  totals: { visitors: number; members: number; views: number };
  today: { visitors: number; members: number; views: number };
  daily: StatsDay[];
  top: { path: string; views: number; visitors: number }[];
  devices: { device: string; visitors: number }[];
  returning: number;
}
const PERIODS = [{ k: "week", label: "This week", days: 7 }, { k: "month", label: "This month", days: 30 }, { k: "year", label: "This year", days: 365 }] as const;
const n = (x: number) => x.toLocaleString("en-US");

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
    <main className="mx-auto max-w-4xl px-5 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Admin</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Visitors</h1>

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
            <p className="mt-2 font-serif text-6xl font-bold leading-none">{n(stats.online.total)}</p>
            <p className="mt-2 text-[16px] text-muted-foreground">{n(stats.online.members)} signed in · {n(stats.online.total - stats.online.members)} guests · seen in the last 5 minutes</p>
            {stats.online.paths.length > 0 && <p className="mt-2 text-sm text-muted-foreground">Reading: {stats.online.paths.map((p) => `${p.path} (${p.n})`).join(", ")}</p>}
          </section>

          <div className="mt-10 flex flex-wrap items-center gap-2" role="group" aria-label="Period">
            {PERIODS.map((p) => <button key={p.k} type="button" onClick={() => setPeriod(p)} className={cn("h-10 rounded-full border px-5 text-sm font-bold", p.k === period.k ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/60")}>{p.label}</button>)}
            <button type="button" onClick={() => void load(period.days)} aria-label="Refresh" className="ml-1 p-2 text-muted-foreground hover:text-primary">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</button>
          </div>

          <section className="mt-6 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4" aria-label="Totals">
            {[["Visitors", stats.totals.visitors], ["Signed in", stats.totals.members], ["Guests", Math.max(0, stats.totals.visitors - stats.totals.members)], ["Pages opened", stats.totals.views]].map(([l, v]) => (
              <div key={l as string}><p className="font-serif text-4xl font-bold">{n(v as number)}</p><p className="text-sm text-muted-foreground">{l}</p></div>
            ))}
          </section>
          <p className="mt-3 text-sm text-muted-foreground">Today: {n(stats.today.visitors)} visitors, {n(stats.today.members)} signed in, {n(stats.today.views)} pages. {n(stats.returning)} came back on another day.</p>

          <section className="mt-10" aria-label="Each day">
            <h2 className="font-serif text-2xl font-bold">Each day</h2>
            {stats.daily.length === 0 ? <p className="mt-3 text-muted-foreground">No visits counted yet.</p> : (
              <div className="mt-4 flex h-40 items-end gap-[3px]" role="img" aria-label="Visitors per day">
                {stats.daily.map((d) => <div key={d.day} title={`${d.day}: ${d.visitors} visitors`} className="min-w-[3px] flex-1 rounded-t bg-primary/80 hover:bg-primary" style={{ height: `${Math.max(3, (d.visitors / maxDay) * 100)}%` }} />)}
              </div>
            )}
          </section>

          <div className="mt-10 grid gap-10 sm:grid-cols-2">
            <section aria-label="Busiest pages"><h2 className="font-serif text-2xl font-bold">Busiest pages</h2><ul className="mt-3 space-y-2">{stats.top.map((t) => <li key={t.path} className="flex items-baseline justify-between gap-3 text-[15px]"><span className="min-w-0 truncate font-medium">{t.path}</span><span className="shrink-0 text-muted-foreground">{n(t.views)}</span></li>)}</ul></section>
            <section aria-label="Devices"><h2 className="font-serif text-2xl font-bold">Devices</h2><ul className="mt-3 space-y-2">{stats.devices.map((t) => <li key={t.device} className="flex items-baseline justify-between text-[15px] capitalize"><span>{t.device}</span><span className="text-muted-foreground">{n(t.visitors)}</span></li>)}</ul></section>
          </div>

          <section className="mt-12" aria-label="Picture to share">
            <h2 className="font-serif text-2xl font-bold">A picture to share</h2>
            <p className="mt-1 text-[15px] text-muted-foreground">Made from the numbers above for {period.label.toLowerCase()}. Download it, or send it straight to WhatsApp.</p>
            <canvas ref={canvas} className="mt-4 w-full max-w-sm rounded-2xl shadow-lg" aria-label="Preview of the picture" />
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={download} className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 font-bold text-primary-foreground"><Download className="h-4 w-4" aria-hidden /> Download</button>
              <button type="button" onClick={share} className="inline-flex h-12 items-center gap-2 rounded-full border border-border px-6 font-bold hover:border-primary/60"><Share2 className="h-4 w-4" aria-hidden /> Share</button>
            </div>
          </section>
        </>
      )}
      {loading && !stats && !error && <p className="mt-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
    </main>
  );
}
