import { useEffect, useState } from "react";
import { Lock, Loader2, ShieldCheck, KeyRound, Smartphone, CreditCard, Check, Pencil, Eye, Download, Mail, Sparkles, ListChecks, BellRing, LineChart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { AccessPass, AccessPlan, PaymentSettings, issuePassForPayment, normalizePassCode, renamePassCode, verifyCode } from "@/lib/access";
import { useAuth } from "@/hooks/useAuth";
import { signInWithGoogle } from "@/lib/social-auth";
import { savePurchaseIntent } from "@/lib/purchase-intent";

/**
 * Paywall shown where the free portion of a page ends. Two ways in:
 *  1. M-Pesa (Palpluss STK push) -> a pass code is issued automatically
 *  2. Entering a pass code already bought on another device
 */
export function Paywall({
  settings,
  hiddenCount,
  label = "questions",
  onUnlocked,
  headline,
  blurb,
  bare = false,
}: {
  settings: PaymentSettings;
  hiddenCount?: number;
  label?: string;
  onUnlocked: (pass: AccessPass) => void;
  headline?: string;
  blurb?: string;
  /** modal usage: drop the card chrome, the parent provides it */
  bare?: boolean;
}) {
  const plans = settings.plans.length ? settings.plans : [];
  const [planId, setPlanId] = useState(plans[0]?.id || "semester");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"mpesa" | "airtel" | "card">("mpesa");
  const [state, setState] = useState<"idle" | "sending" | "waiting" | "error">("idle");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"buy" | "code">("buy");
  const [code, setCode] = useState("");
  const [issued, setIssued] = useState<AccessPass | null>(null);
  const [customCode, setCustomCode] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameMsg, setRenameMsg] = useState("");
  const { user, loading: authLoading } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  const startGoogle = async () => {
    setSigningIn(true);
    savePurchaseIntent(planId);
    sessionStorage.setItem("post_login_redirect", window.location.pathname + window.location.search);
    const res = await signInWithGoogle();
    if (res.redirected) return;
    setSigningIn(false);
    if (res.error) {
      setState("error");
      setMessage(res.error);
    }
  };

  const plan: AccessPlan = plans.find((p) => p.id === planId) || {
    id: "semester", label: "Semester pass (3 months)", price: settings.price, days: 90, download: true,
  };

  const pollPayment = async (transactionId: string, selectedPlanId = plan.id) => {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const { data: json, error } = await supabase.functions.invoke("check-payment", {
          body: { transaction_id: transactionId },
        });
        if (error) continue;
        if (json?.status === "completed") {
          const pass = await issuePassForPayment(transactionId, selectedPlanId);
          if (pass) {
            setIssued(pass);
            setCustomCode(pass.code);
            onUnlocked(pass);
            return;
          }
          setState("error");
          setMessage("Payment received but the pass could not be issued. Contact support with your M-Pesa code.");
          return;
        }
        if (json?.status === "failed") {
          setState("error");
          setMessage("The payment was not completed. You can try again.");
          return;
        }
      } catch { /* keep polling */ }
    }
    setState("error");
    setMessage("Still waiting for payment confirmation. If you were charged, do not pay again; contact support with your payment reference.");
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("onekitty_ref");
    const returnedPlan = params.get("onekitty_plan") || plan.id;
    if (!ref) return;
    window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    setState("waiting");
    setMessage("Checkout returned. Confirming your payment securely…");
    void pollPayment(ref, returnedPlan);
  }, []);

  const payByCard = async () => {
    if (!user) { setState("error"); setMessage("Please sign in first."); return; }
    setState("sending"); setMessage("");
    const { data, error } = await supabase.functions.invoke("initiate-onekitty-checkout", {
      body: { method: "card", amount: plan.price || settings.price, package_type: plan.id },
    });
    if (error || !data?.success || !data?.checkout_url) {
      setState("error"); setMessage(data?.error || error?.message || "Could not open secure card checkout."); return;
    }
    window.location.assign(data.checkout_url);
  };

  const payAirtel = async () => {
    if (!user) { setState("error"); setMessage("Please sign in first."); return; }
    if (!/^(\\+?254|0)?\\d{9}$/.test(phone.replace(/\\s+/g, ""))) {
      setState("error"); setMessage("Enter a valid Airtel Money number."); return;
    }
    setState("sending"); setMessage("");
    const { data, error } = await supabase.functions.invoke("initiate-onekitty-checkout", {
      body: { method: "airtel", phone, amount: plan.price || settings.price, package_type: plan.id },
    });
    if (error || !data?.success) {
      setState("error"); setMessage(data?.error || error?.message || "Could not start Airtel Money payment."); return;
    }
    setState("waiting"); setMessage("Airtel Money payment request sent. Approve it on your phone.");
    void pollPayment(data.transaction_id);
  };

  const pay = async () => {
    if (!user) {
      setState("error");
      setMessage("Please sign in with Google first — it ties the subscription to your account.");
      return;
    }
    if (!/^(\+?254|0)?\d{9}$/.test(phone.replace(/\s+/g, ""))) {
      setState("error");
      setMessage("Enter a valid Safaricom number, e.g. 07XXXXXXXX.");
      return;
    }
    setState("sending");
    setMessage("");
    const { data, error } = await supabase.functions.invoke("initiate-payment", {
      body: { phone, amount: plan.price || settings.price, package_type: plan.id },
    });
    if (error || !data?.success) {
      setState("error");
      const code = String(data?.code || "").toUpperCase();
      const retryAfter = Number(data?.details?.retryAfterSeconds || 0);
      const actionableMessage =
        code === "NO_PAYMENT_CHANNELS"
          ? "Payments are not fully configured yet. The administrator needs to add a PalPlus payment channel."
          : code === "NO_DEFAULT_CHANNEL"
            ? "Payments are not fully configured yet. The administrator needs to select a default PalPlus payment channel."
            : code === "INSUFFICIENT_SERVICE_BALANCE"
              ? "The payment service wallet needs to be topped up. Please try again shortly."
              : code === "STK_TEMP_BANNED" && retryAfter > 0
                ? `M-Pesa requests are temporarily paused. Please retry in about ${Math.ceil(retryAfter / 60)} minute(s).`
                : data?.error || error?.message || "Could not start the payment. Please try again.";
      setMessage(actionableMessage);
      return;
    }
    setState("waiting");
    setMessage("Sent. Check your phone and enter your M-Pesa PIN — keep this page open.");
    pollPayment(data.transaction_id);
  };

  const redeem = async () => {
    setState("sending");
    setMessage("");
    const res = await verifyCode(code);
    if (!res.ok || !res.pass) {
      setState("error");
      setMessage(res.error || "Invalid code.");
      return;
    }
    setIssued(res.pass);
    setCustomCode(res.pass.code);
    onUnlocked(res.pass);
  };

  const applyCustomCode = async () => {
    if (!issued) return;
    const next = customCode.trim().toUpperCase();
    if (!next || next === issued.code) return;
    setRenaming(true);
    setRenameMsg("");
    const res = await renamePassCode(issued.code, next);
    setRenaming(false);
    if (!res.ok || !res.pass) {
      setRenameMsg(res.error || "Could not change the code.");
      return;
    }
    setIssued(res.pass);
    setCustomCode(res.pass.code);
    onUnlocked(res.pass);
    setRenameMsg("Code updated — use it on your other device.");
  };

  if (issued) {
    return (
      <div className={`not-prose text-center ${bare ? "" : "my-8 rounded-2xl border border-primary/30 bg-primary/5 p-6"}`}>
        <ShieldCheck className="mx-auto h-8 w-8 text-primary" />
        <p className="mt-3 font-serif text-lg font-bold text-foreground">Subscription active</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Valid until {new Date(issued.expires_at).toLocaleDateString()}. Answers and PDF handouts are unlocked.
        </p>

        <div className="mx-auto mt-4 max-w-sm rounded-xl border border-border bg-card p-4 text-left">
          <p className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <Pencil className="h-3 w-3" /> Your pass code — you can change it
          </p>
          <div className="flex gap-2">
            <input
              value={customCode}
              onChange={(e) => setCustomCode(normalizePassCode(e.target.value))}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm font-bold text-foreground outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={applyCustomCode}
              disabled={renaming || !customCode.trim() || customCode.trim().toUpperCase() === issued.code}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {renaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save
            </button>
          </div>
          {renameMsg && <p className="mt-2 text-[11px] font-semibold text-primary">{renameMsg}</p>}
           <p className="mt-2 inline-flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
             <Mail className="mt-0.5 h-3 w-3 shrink-0" />
             This subscription is linked to <strong>your signed-in email</strong> and works wherever you sign in.
           </p>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
           Manage your subscription and code any time on your{" "}
          <Link to="/account" className="font-semibold text-primary underline underline-offset-4">account page</Link>.
        </p>
      </div>
    );
  }

  const busy = state === "sending" || state === "waiting";

  // Shortest plan first; show what each costs per month so the better deal is obvious.
  const sorted = [...plans].sort((a, b) => a.days - b.days);
  const perMonth = (p: AccessPlan) => (p.days >= 28 ? p.price / (p.days / 30) : null);
  const baseRate = sorted.map(perMonth).find((v) => v !== null) ?? null;
  const bestRate = Math.min(...sorted.map((p) => perMonth(p) ?? Infinity));
  const duration = (d: number) => (d >= 365 ? "12 months" : d >= 85 ? "3 months" : d >= 28 ? `${Math.round(d / 30)} month${Math.round(d / 30) === 1 ? "" : "s"}` : d === 1 ? "1 day" : `${d} days`);

  return (
    <div className={`not-prose relative overflow-hidden ${bare ? "" : "my-8 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"}`}>
      <div className="mx-auto max-w-lg">
        <div className="text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0f766e] to-[#0b2545] text-white shadow-md"><Lock className="h-5 w-5" /></span>
          <h2 className="mt-3 font-serif text-2xl font-bold leading-snug text-foreground">
            {headline || `Unlock the ${label}`}
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
            {blurb || "Questions stay free to read. One subscription reveals every answer, with explanations and PDF handouts, across all of Ompath Study."}
          </p>
        </div>

        <ul className="mt-4 grid grid-cols-1 gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-2">
          {[[Eye, "Every answer revealed"], [Check, "Explanations and study details"], [Sparkles, "Unlimited Ompath AI questions"], [ListChecks, "Quizzes of up to 50 MCQs"], [LineChart, "Review of your weak topics"], [BellRing, "Study plans and reminders"], [Download, "Watermarked PDF handouts"], [Mail, "Follows your email, any device"]].map(([Icon, text]) => {
            const I = Icon as typeof Eye;
            return <li key={text as string} className="flex items-center gap-2 text-foreground/85"><I className="h-4 w-4 shrink-0 text-primary" />{text as string}</li>;
          })}
        </ul>

        <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="How to unlock">
          {([["buy", "Pay securely"], ["code", "I have a code"]] as const).map(([id, text]) => (
            <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => { setMode(id); setState("idle"); }}
              className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${mode === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{text}</button>
          ))}
        </div>

        {mode === "buy" ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Choose a plan">
              {sorted.map((p) => {
                const rate = perMonth(p);
                const best = sorted.length > 1 && rate !== null && rate === bestRate && baseRate !== null && rate < baseRate * 0.9;
                const save = best && baseRate ? Math.round((1 - rate! / baseRate) * 100) : 0;
                const on = planId === p.id;
                return (
                  <button key={p.id} type="button" role="radio" aria-checked={on} onClick={() => setPlanId(p.id)}
                    className={`relative rounded-2xl border-2 p-3.5 text-left transition-all ${on ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40"}`}>
                    {best && <span className="absolute -top-2.5 right-3 rounded-full bg-[#f2b632] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#0b2545]">Best value{save ? ` · save ${save}%` : ""}</span>}
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{duration(p.days)}</p>
                    <p className="mt-1 font-serif text-2xl font-bold leading-none text-foreground">KES {p.price}</p>
                    <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{rate !== null && sorted.length > 1 ? `About KES ${Math.round(rate)} a month` : p.label.replace(/\s*\(.*\)\s*/, "")}</p>
                    <span className={`mt-2 inline-flex h-5 w-5 items-center justify-center rounded-full border-2 ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{on && <Check className="h-3 w-3" />}</span>
                  </button>
                );
              })}
            </div>

            {!user && !authLoading && (
              <div className="mt-4 rounded-2xl border border-primary/25 bg-primary/5 p-4 text-left">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">Step 1 · Sign in</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                  Sign in with Google first. We bring you straight back here to complete your payment, and your subscription follows you on any device.
                </p>
                <button type="button" onClick={startGoogle} disabled={signingIn}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60">
                  {signingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Continue with Google
                </button>
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  Already paid on another device? <button type="button" onClick={() => { setMode("code"); setState("idle"); }} className="font-semibold text-primary underline underline-offset-4">Use your code</button>.
                </p>
              </div>
            )}

            <div className={`mt-4 space-y-3 ${!user && !authLoading ? "pointer-events-none opacity-40" : ""}`}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Step 2 · Select how you want to pay</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Payment method">
                {([
                  { id: "mpesa", label: "M-Pesa", detail: "Prompt sent to your phone", Icon: Smartphone },
                  { id: "airtel", label: "Airtel Money", detail: "Airtel STK prompt", Icon: Smartphone },
                  { id: "card", label: "Debit / Credit Card", detail: "Secure OneKitty checkout", Icon: CreditCard },
                ] as const).map((item) => {
                  const selected = paymentMethod === item.id;
                  return <button key={item.id} type="button" role="radio" aria-checked={selected} onClick={() => { setPaymentMethod(item.id); setState("idle"); setMessage(""); }}
                    className={`flex min-h-[88px] items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${selected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-background hover:border-primary/40"}`}>
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}><item.Icon className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-foreground">{item.label}</span><span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{item.detail}</span></span>
                    {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>;
                })}
              </div>
              {paymentMethod !== "card" && <div className="space-y-2">
                <label htmlFor="pay-phone" className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{paymentMethod === "mpesa" ? "M-Pesa phone number" : "Airtel Money phone number"}</label>
                <div className="relative"><Smartphone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input id="pay-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="07XX XXX XXX" className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
              </div>}
              {paymentMethod === "mpesa" && <button type="button" onClick={pay} disabled={busy || !user} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-base font-bold text-primary-foreground shadow-sm disabled:opacity-60"><Lock className="h-4 w-4" /> {busy ? "Processing…" : `Pay KES ${plan.price || settings.price} with M-Pesa`}</button>}
              {paymentMethod === "airtel" && <button type="button" onClick={payAirtel} disabled={busy || !user} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-base font-bold text-primary-foreground shadow-sm disabled:opacity-60"><Smartphone className="h-4 w-4" /> {busy ? "Processing…" : `Pay KES ${plan.price || settings.price} with Airtel Money`}</button>}
              {paymentMethod === "card" && <div className="space-y-2"><p className="text-center text-xs text-muted-foreground">Your card details are entered securely on OneKitty. OmpathStudy will use a previously saved mobile number for checkout setup when OneKitty requires it; no phone field is shown here.</p><button type="button" onClick={payByCard} disabled={busy || !user} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-base font-bold text-primary-foreground shadow-sm disabled:opacity-60"><CreditCard className="h-4 w-4" /> {busy ? "Opening secure checkout…" : `Continue to card payment · KES ${plan.price || settings.price}`}</button></div>}
            </div>
            {busy && (
              <div className="mt-4 rounded-2xl border border-primary/25 bg-primary/5 p-4 text-left">
                <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Payment in progress
                </p>
                <ol className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-foreground/80">
                  <li className={state === "waiting" ? "font-semibold text-primary" : ""}>1 · {paymentMethod === "airtel" ? "Airtel Money" : paymentMethod === "card" ? "Card checkout" : "M-Pesa"} request initiated</li>
                  <li>2 · Complete the payment on your phone or hosted checkout</li>
                  <li>3 · Your answers unlock here automatically</li>
                </ol>
                <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-primary/15">
                  <div className="h-full w-1/3 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-primary" />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">Keep this page open. It can take up to a minute.</p>
              </div>
            )}
          </>
        ) : (
          <div className="mt-4 space-y-2">
            <label htmlFor="pass-code" className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Your pass code</label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input id="pass-code" value={code} onChange={(e) => setCode(normalizePassCode(e.target.value))} placeholder="OM-XXXXXXXX"
                className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-3 font-mono text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </div>
            <button type="button" onClick={redeem} disabled={state === "sending"}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-base font-bold text-primary-foreground disabled:opacity-60">
              {state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Unlock with code
            </button>
          </div>
        )}

        {message && (
          <p role="status" className={`mt-3 rounded-xl px-3 py-2 text-center text-xs font-semibold ${state === "error" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{message}</p>
        )}
        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
          One subscription covers the whole site wherever you sign in. Downloads carry your pass code.{" "}
          <Link to="/account" className="font-semibold text-primary underline underline-offset-4">Manage your subscription</Link>
        </p>
      </div>
    </div>
  );
}

/** Small banner used when the admin has set the site price to zero. */
export function FreeAccessBanner({ count, label = "questions" }: { count: number; label?: string }) {
  return (
    <div className="not-prose mb-5 flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
      <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
      <p className="text-[13px] font-semibold leading-snug text-foreground">
        This page is free to view — every {label.replace(/s$/, "")} and the full answer key are unlocked.
      </p>
    </div>
  );
}
