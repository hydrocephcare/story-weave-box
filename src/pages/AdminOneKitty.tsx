import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { AlertTriangle, ArrowUpRight, CreditCard, Loader2, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Payment = {
  id: string; external_ref: string; amount: number; currency: string; phone_number: string;
  payment_mode: string; requested_channel_code: string | null; provider_payment_ref: string | null;
  request_reference: string | null; checkout_url: string | null; callback_status: string;
  callback_result_code: string | null; callback_result_desc: string | null; callback_channel_code: string | null;
  callback_transaction_code: string | null; callback_received_at: string | null; callback_verified: boolean; created_at: string;
};
type ProviderTxn = { id: number; reference: string; external_ref: string; amount: number; currency: string; status: string; channel_name: string; transaction_code: string; created_at: string; type_in_out: string };
type KittyInfo = { id: number; title: string; status: string; default_currency_code: string; wallets: { currency_code: string; balance: number; available: number; is_primary: boolean }[] };
type Initiation = { success: boolean; error?: string; external_ref?: string; mode?: string; checkout_url?: string | null; provider_message?: string; next_step?: string };

const money = (v: number) => new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(v);
const statusLabel = (p: Payment) => p.callback_status === "callback_reported_success" ? "Callback says successful" : p.callback_status === "callback_reported_failure" ? "Callback says failed" : "Awaiting callback";

async function getFunctionErrorMessage(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : "The payment request failed.";
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    const payload = await context.clone().json().catch(() => null) as { error?: unknown; message?: unknown } | null;
    if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
    if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
  }
  return fallback;
}

export default function AdminOneKitty() {
  const { isAdmin } = useAuth();
  const [amount, setAmount] = useState("10");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<"card" | "mpesa" | "airtel">("card");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [last, setLast] = useState<Initiation | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [kitty, setKitty] = useState<KittyInfo | null>(null);
  const [providerTransactions, setProviderTransactions] = useState<ProviderTxn[]>([]);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    const { data, error: invokeError } = await supabase.functions.invoke("onekitty-initiate", { body: { action: "status" } });
    if (invokeError) setError(await getFunctionErrorMessage(invokeError));
    else if (data?.success) { setPayments(data.payments || []); setKitty(data.kitty || null); setProviderTransactions(data.provider_transactions || []); }
    else setError(data?.error || "Could not load OneKitty test payments.");
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { void load(); }, [load]);

  const startPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(""); setNotice(""); setLast(null);
    const { data, error: invokeError } = await supabase.functions.invoke("onekitty-initiate", {
      body: { amount: Number(amount), phone_number: phone, method },
    });
    setBusy(false);
    if (invokeError) { setError(await getFunctionErrorMessage(invokeError)); return; }
    if (!data?.success) { setError(data?.error || "Could not start payment."); return; }
    setLast(data);
    setNotice(data.provider_message || "OneKitty accepted the request.");
    await load();
    if (data.checkout_url) window.location.assign(data.checkout_url);
  };

  if (!isAdmin) return <main className="mx-auto max-w-3xl px-5 py-12"><h1 className="font-serif text-2xl font-bold">OneKitty payment testing</h1><p className="mt-2 text-sm text-muted-foreground">Administrator access is required.</p></main>;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-5">
      <Helmet><title>OneKitty payment testing | OmpathStudy</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Admin · Payment integration</p>
        <h1 className="mt-1 font-serif text-3xl font-bold sm:text-4xl">OneKitty payment testing</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Run controlled low-value test transactions and inspect OneKitty's response and callback delivery. This page is separate from live student purchases.</p>
      </header>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><CreditCard className="h-5 w-5" /></div>
          <div><h2 className="font-serif text-xl font-bold">Start a test payment</h2><p className="text-xs text-muted-foreground">Select one method at a time. Card opens OneKitty hosted checkout; M-Pesa and Airtel send a direct STK prompt.</p></div>
        </div>
        <form onSubmit={startPayment} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="ok-amount">Amount (KES)</Label><Input id="ok-amount" inputMode="numeric" type="number" min="1" max="1000000" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
            {method !== "card" && <div className="space-y-2"><Label htmlFor="ok-phone">Payer phone number</Label><Input id="ok-phone" type="tel" autoComplete="tel" placeholder="0712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>}
          </div>
          <div className="space-y-2"><Label>Payment method to test</Label>
            <Select value={method} onValueChange={(value) => setMethod(value as "card" | "mpesa" | "airtel")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="card">Card — hosted checkout</SelectItem>
              <SelectItem value="mpesa">M-Pesa — STK push</SelectItem>
              <SelectItem value="airtel">Airtel Money — STK push</SelectItem>
            </SelectContent></Select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy || !amount || (method !== "card" && !phone.trim())} className="gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : method === "card" ? <CreditCard className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}{busy ? "Starting…" : "Start test payment"}</Button>
            <span className="text-xs text-muted-foreground">The OneKitty API key remains on the server.</span>
          </div>
        </form>
        {error && <div role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
        {notice && <div role="status" className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-foreground"><p className="font-semibold">{notice}</p>{last?.next_step && <p className="mt-1 text-sm text-muted-foreground">{last.next_step}</p>}{last?.external_ref && <p className="mt-2 break-all font-mono text-xs">Reference: {last.external_ref}</p>}</div>}
        {last?.checkout_url && <a href={last.checkout_url} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary underline" target="_blank" rel="noreferrer">Open hosted checkout <ArrowUpRight className="h-4 w-4" /></a>}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="font-semibold">Callback URL to register in OneKitty</h2>
        <p className="mt-1 text-xs text-muted-foreground">Use the callback URL you already shared with OneKitty support. It now routes OneKitty confirmations and preserves the existing PalPlus handler.</p>
        <code className="mt-3 block break-all rounded-lg bg-muted p-3 text-xs">https://strfwaqvxvkhjbqrwmla.supabase.co/functions/v1/payment-callback</code>
      </section>

      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5">
        <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div>
          <h2 className="font-semibold">Payment verification and access control</h2>
          <p className="mt-1 text-sm text-muted-foreground">The callback endpoint checks successful OneKitty notifications against the Developer Apps Transactions API. This requires the separate Developer Apps key and matching kitty access. Test payments remain isolated: they do not activate subscriptions or unlock paid study materials.</p>
        </div></div>
      </section>

      {kitty && <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">Connected OneKitty</p><h2 className="mt-1 font-serif text-xl font-bold">{kitty.title}</h2><p className="text-xs text-muted-foreground">Kitty #{kitty.id} · {kitty.status}</p></div><Badge variant={kitty.status === "ACTIVE" ? "default" : "secondary"}>{kitty.status}</Badge></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{kitty.wallets?.map((wallet) => <div key={wallet.currency_code} className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">{wallet.currency_code} {wallet.is_primary ? "· Primary wallet" : ""}</p><p className="mt-1 text-xl font-semibold">{new Intl.NumberFormat("en-KE", { style: "currency", currency: wallet.currency_code, maximumFractionDigits: 2 }).format(wallet.balance || 0)}</p><p className="text-xs text-muted-foreground">Available: {wallet.available}</p></div>)}</div>
      </section>}

      {providerTransactions.length > 0 && <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="font-serif text-xl font-bold">OneKitty account transactions</h2><p className="mb-3 text-xs text-muted-foreground">Latest transactions retrieved directly from the authenticated Developer API.</p>
        <div className="space-y-2">{providerTransactions.slice(0, 10).map((txn) => <div key={txn.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"><div><p className="text-sm font-semibold">{money(Number(txn.amount))} · {txn.channel_name || txn.currency}</p><p className="break-all font-mono text-[10px] text-muted-foreground">{txn.external_ref || txn.reference}</p><p className="text-xs text-muted-foreground">{txn.created_at ? new Date(txn.created_at).toLocaleString("en-KE") : ""}</p></div><Badge variant={txn.status === "SUCCESS" ? "default" : "secondary"}>{txn.status}</Badge></div>)}</div>
      </section>}

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-serif text-xl font-bold">Recent test transactions</h2><p className="text-xs text-muted-foreground">Latest 25 requests sent from this integration.</p></div><Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-2"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</Button></div>
        {loading ? <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading transactions…</div> : payments.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No OneKitty test transactions yet.</p> : <div className="space-y-3">
          {payments.map((p) => <article key={p.id} className="rounded-xl border border-border p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{money(Number(p.amount))} <span className="text-xs font-normal text-muted-foreground">· {p.payment_mode === "CHECKOUT" ? "Card / hosted checkout" : p.requested_channel_code === "63903" ? "Airtel Money STK" : "M-Pesa STK"}</span></p><p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{p.external_ref}</p></div><Badge variant={p.callback_status === "callback_reported_success" ? "default" : p.callback_status === "callback_reported_failure" ? "destructive" : "secondary"}>{statusLabel(p)}</Badge></div>
            <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2"><p>Phone: {p.phone_number}</p><p>Created: {new Date(p.created_at).toLocaleString("en-KE")}</p>{p.callback_result_code && <p>Result code: {p.callback_result_code}</p>}{p.callback_channel_code && <p>Channel: {p.callback_channel_code === "55" ? "Card" : p.callback_channel_code}</p>}{p.callback_transaction_code && <p>Provider transaction: {p.callback_transaction_code}</p>}{p.callback_result_desc && <p className="sm:col-span-2">{p.callback_result_desc}</p>}</div>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">{p.callback_verified ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />} {p.callback_verified ? "Provider-verified" : "Callback is unverified; no access granted"}</div>
          </article>)}
        </div>}
      </section>
    </main>
  );
}
