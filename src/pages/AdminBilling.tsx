import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Download, Loader2, Plus, Trash2 } from "lucide-react";
import { billingReport, grantPass, kes, loadOverview, loadPasses, loadPayments, loadPrices, revokePass, savePrices, type Overview, type Pass, type PaymentRow, type Prices } from "@/lib/billing";

const field = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";
const card = "rounded-2xl border border-border bg-card p-4 sm:p-5";
const day = (s: string) => new Date(s).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
const mask = (p: string | null) => (p ? `${p.slice(0, 5)}•••${p.slice(-2)}` : "");

/** /admin/billing: everything about money in one place. The admin assistant can do each of these things too (ask it, for example, "set the annual plan to 500"). */
export default function AdminBilling() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [pr, setPr] = useState<Prices | null>(null);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [pays, setPays] = useState<PaymentRow[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(true);
  const [email, setEmail] = useState(""); const [days, setDays] = useState("90"); const [given, setGiven] = useState("");
  const [report, setReport] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [o, p, ps, py] = await Promise.all([loadOverview(), loadPrices(), loadPasses(), loadPayments()]);
      setOv(o); setPr(p); setPasses(ps); setPays(py); setMsg("");
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async (patch: Partial<Prices>, ok = "Saved. Readers see the change straight away.") => {
    try { await savePrices(patch); setPr((x) => (x ? { ...x, ...patch } : x)); setMsg(ok); } catch (e) { setMsg((e as Error).message); }
  };
  const max = useMemo(() => Math.max(1, ...(ov?.daily ?? []).map((d) => Number(d.total))), [ov]);
  const live = passes.filter((p) => new Date(p.expires_at) > new Date());

  if (busy && !ov) return <main className="mx-auto max-w-4xl px-5 py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></main>;
  if (!pr || !ov) return <main className="mx-auto max-w-4xl px-5 py-10"><h1 className="font-serif text-3xl font-bold">Billing</h1><p className="mt-3 text-sm text-destructive">{msg || "Could not load billing."} Only an administrator can open this page, and the setup file 20261028130000_admin_billing.sql must have been run once.</p></main>;

  const setPlan = (i: number, patch: Partial<Prices["plans"][number]>) => setPr({ ...pr, plans: pr.plans.map((p, k) => (k === i ? { ...p, ...patch } : p)) });

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-5">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Admin</p>
        <h1 className="mt-1 font-serif text-3xl font-bold sm:text-4xl">Billing</h1>
        <p className="mt-2 text-sm text-muted-foreground">Prices, plans, income and who has access. You can also ask the admin assistant to do any of this in plain words.</p>
        {msg && <p className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-sm font-semibold text-foreground" role="status">{msg}</p>}
      </header>

      <section className={card} aria-label="Subscriptions switch">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-serif text-xl font-bold">Subscriptions are {pr.subscriptions ? "ON" : "OFF"}</h2><p className="text-sm text-muted-foreground">{pr.subscriptions ? "Locked pages, the payment pop-up and the plans below are live for readers." : "Everything is free. Turn on to start charging with the prices below."}</p></div>
          <button type="button" onClick={() => { if (window.confirm(pr.subscriptions ? "Make everything free for all readers?" : "Start charging readers with the current prices?")) void save({ subscriptions: !pr.subscriptions }, pr.subscriptions ? "Subscriptions are OFF: everything is free." : "Subscriptions are ON."); }} className={`h-11 rounded-full px-6 text-sm font-bold ${pr.subscriptions ? "border border-border" : "bg-primary text-primary-foreground"}`}>{pr.subscriptions ? "Turn off" : "Turn on"}</button>
        </div>
      </section>

      <section aria-label="Income" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Today", kes(ov.today)], ["Last 7 days", kes(ov.d7)], ["Last 30 days", kes(ov.d30)], ["All time", kes(ov.total)], ["Payments", String(ov.completed)], ["Failed", String(ov.failed)], ["Pending", String(ov.pending)], ["Active passes", String(ov.active_passes)]].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-border bg-card p-3"><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{k}</p><p className="mt-1 font-serif text-xl font-bold">{v}</p></div>
        ))}
      </section>

      {ov.daily.length > 0 && (
        <section className={card} aria-label="Daily income"><h2 className="font-serif text-lg font-bold">Income, last 30 days</h2>
          <div className="mt-3 flex h-24 items-end gap-1" role="img" aria-label="Bars of income per day">{ov.daily.map((d) => <div key={d.d} title={`${d.d}: ${kes(Number(d.total))}`} className="min-w-0 flex-1 rounded-t bg-primary/70" style={{ height: `${Math.max(6, (Number(d.total) / max) * 100)}%` }} />)}</div>
          {ov.by_plan.length > 0 && <p className="mt-3 text-xs text-muted-foreground">By plan: {ov.by_plan.map((b) => `${b.plan} ${b.n} (${kes(Number(b.total))})`).join(" · ")}</p>}
        </section>
      )}

      <section className={card} aria-label="Plans and prices">
        <h2 className="font-serif text-xl font-bold">Plans and prices (KES)</h2>
        <ul className="mt-3 space-y-2">
          {pr.plans.map((p, i) => (
            <li key={p.id} className="grid grid-cols-2 gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_110px_110px_auto_auto]">
              <input className={`${field} col-span-2 sm:col-span-1`} value={p.label} onChange={(e) => setPlan(i, { label: e.target.value })} placeholder="Plan name" aria-label="Plan name" />
              <label className="text-[11px] font-bold text-muted-foreground">Price<input className={field} type="number" min={0} value={p.price} onChange={(e) => setPlan(i, { price: Number(e.target.value) })} /></label>
              <label className="text-[11px] font-bold text-muted-foreground">Days<input className={field} type="number" min={1} value={p.days} onChange={(e) => setPlan(i, { days: Number(e.target.value) })} /></label>
              <label className="flex items-center gap-2 self-end pb-2 text-xs font-semibold"><input type="checkbox" checked={p.download !== false} onChange={(e) => setPlan(i, { download: e.target.checked })} className="h-4 w-4" /> Downloads</label>
              <button type="button" aria-label={`Remove ${p.label || "plan"}`} onClick={() => setPr({ ...pr, plans: pr.plans.filter((_, k) => k !== i) })} className="self-end rounded-lg border border-border p-2.5 hover:border-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
          {pr.plans.length === 0 && <li className="text-sm text-muted-foreground">No plans yet. Add one below.</li>}
        </ul>
        <button type="button" onClick={() => setPr({ ...pr, plans: [...pr.plans, { id: `plan-${Date.now().toString(36)}`, label: "", price: 150, days: 90, download: true }] })} className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-bold hover:border-primary/50"><Plus className="h-4 w-4" /> Add a plan</button>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-semibold">Reveal price<input className={field} type="number" min={0} value={pr.revealPrice} onChange={(e) => setPr({ ...pr, revealPrice: Number(e.target.value) })} /><span className="text-[11px] font-normal text-muted-foreground">Per reveal. 0 = free.</span></label>
          <label className="text-sm font-semibold">Exam price<input className={field} type="number" min={0} value={pr.examPrice} onChange={(e) => setPr({ ...pr, examPrice: Number(e.target.value) })} /></label>
          <label className="text-sm font-semibold">MCQ pack price<input className={field} type="number" min={0} value={pr.mcqPrice} onChange={(e) => setPr({ ...pr, mcqPrice: Number(e.target.value) })} /></label>
          <label className="text-sm font-semibold">Free MCQs per set<input className={field} type="number" min={0} value={pr.mcqFreeLimit} onChange={(e) => setPr({ ...pr, mcqFreeLimit: Number(e.target.value) })} /></label>
          <label className="text-sm font-semibold">Free part of a locked page (%)<input className={field} type="number" min={5} max={90} value={pr.freePercent} onChange={(e) => setPr({ ...pr, freePercent: Number(e.target.value) })} /></label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold"><input type="checkbox" checked={pr.downloads} onChange={(e) => setPr({ ...pr, downloads: e.target.checked })} className="h-4 w-4" /> Allow PDF downloads</label>
        </div>
        <button type="button" onClick={() => void save({ plans: pr.plans, revealPrice: pr.revealPrice, examPrice: pr.examPrice, mcqPrice: pr.mcqPrice, mcqFreeLimit: pr.mcqFreeLimit, freePercent: pr.freePercent, downloads: pr.downloads })} className="mt-4 h-11 rounded-full bg-primary px-7 text-sm font-bold text-primary-foreground">Save prices</button>
        <p className="mt-3 text-xs text-muted-foreground">Answers payment pop-up for past papers: <Link to="/admin/paywall" className="font-bold text-primary hover:underline">open its settings</Link>. M-Pesa payments run through PalPluss; its keys are stored in Supabase secrets (<code>PALPLUSS_API_KEY</code>, <code>PALPLUSS_CHANNEL_ID</code>).</p>
      </section>

      <section className={card} aria-label="Access passes">
        <h2 className="font-serif text-xl font-bold">Access passes <span className="text-sm font-semibold text-muted-foreground">{live.length} active</span></h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input className={`${field} min-w-0 flex-1`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Student e-mail, to give free access" aria-label="Student e-mail" />
          <input className={`${field} w-24`} type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} aria-label="Days" />
          <button type="button" onClick={async () => { try { const c = await grantPass(email, Number(days)); setGiven(`Access given to ${email} for ${days} days. Their code: ${c}`); setEmail(""); void load(); } catch (e) { setGiven((e as Error).message); } }} className="h-10 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground">Give access</button>
        </div>
        {given && <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-700" role="status"><BadgeCheck className="h-4 w-4" aria-hidden /> {given}</p>}
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="py-1.5 pr-3">E-mail</th><th className="pr-3">Plan</th><th className="pr-3">Expires</th><th className="pr-3">Paid</th><th /></tr></thead>
          <tbody>{passes.slice(0, 60).map((p) => { const on = new Date(p.expires_at) > new Date(); return (
            <tr key={p.id} className="border-t border-border"><td className="py-2 pr-3">{p.email || "-"}<span className="block text-[11px] text-muted-foreground">{p.code}</span></td><td className="pr-3">{p.plan}</td><td className={`pr-3 ${on ? "" : "text-muted-foreground line-through"}`}>{day(p.expires_at)}</td><td className="pr-3">{kes(Number(p.amount))}</td>
              <td className="text-right">{on && <button type="button" onClick={async () => { if (window.confirm(`End access for ${p.email || p.code}?`)) { await revokePass({ id: p.id }); void load(); } }} className="rounded-full border border-border px-3 py-1 text-xs font-bold hover:border-destructive hover:text-destructive">End</button>}</td></tr>); })}
          </tbody></table></div>
      </section>

      <section className={card} aria-label="Payments">
        <div className="flex items-center justify-between gap-3"><h2 className="font-serif text-xl font-bold">Recent payments</h2>
          <button type="button" onClick={() => { const rows = [["date", "amount", "status", "plan", "name", "email", "phone", "mpesa"], ...pays.map((p) => [p.created_at, p.amount, p.payment_status, p.package_type ?? "", p.buyer_name ?? "", p.buyer_email ?? "", p.phone_number ?? "", p.mpesa_code ?? ""])]; const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "payments.csv"; a.click(); }} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-4 text-xs font-bold hover:border-primary/50"><Download className="h-3.5 w-3.5" /> CSV</button></div>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="py-1.5 pr-3">Date</th><th className="pr-3">Amount</th><th className="pr-3">Status</th><th className="pr-3">Plan</th><th>Who</th></tr></thead>
          <tbody>{pays.map((p) => <tr key={p.id} className="border-t border-border"><td className="py-2 pr-3">{day(p.created_at)}</td><td className="pr-3 font-semibold">{kes(Number(p.amount))}</td><td className={`pr-3 text-xs font-bold ${p.payment_status === "completed" ? "text-emerald-700" : p.payment_status === "failed" ? "text-rose-700" : "text-amber-700"}`}>{p.payment_status}</td><td className="pr-3">{p.package_type ?? "-"}</td><td className="text-xs">{p.buyer_name || p.buyer_email || mask(p.phone_number)}{p.mpesa_code ? <span className="block text-muted-foreground">{p.mpesa_code}</span> : null}</td></tr>)}
            {pays.length === 0 && <tr><td colSpan={5} className="py-4 text-muted-foreground">No payments yet.</td></tr>}</tbody></table></div>
      </section>

      <section className={card} aria-label="Summary for the assistant">
        <button type="button" onClick={async () => setReport(await billingReport())} className="h-10 rounded-full border border-border px-5 text-sm font-bold hover:border-primary/50">Write a short money summary</button>
        {report && <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-xs leading-relaxed">{report}</pre>}
      </section>
    </main>
  );
}
