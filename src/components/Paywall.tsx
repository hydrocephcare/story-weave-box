import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Check, Pencil, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { AccessPass, AccessPlan, PaymentSettings, issuePassForPayment, normalizePassCode, renamePassCode, verifyCode } from "@/lib/access";
import { useAuth } from "@/hooks/useAuth";
import { signInWithGoogle } from "@/lib/social-auth";
import { savePurchaseIntent } from "@/lib/purchase-intent";
import { getSetting } from "@/lib/store";

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
  const [planId, setPlanId] = useState(() => plans.find((p) => p.id.toLowerCase() === "annual" || /annual|yearly|12\\s*months/i.test(p.label))?.id || plans[0]?.id || "annual");
  const countryData: Record<string, { name: string; dial: string; flag: string }> = {
    KE:{name:"Kenya",dial:"254",flag:"🇰🇪"}, TZ:{name:"Tanzania",dial:"255",flag:"🇹🇿"}, UG:{name:"Uganda",dial:"256",flag:"🇺🇬"},
    RW:{name:"Rwanda",dial:"250",flag:"🇷🇼"}, BI:{name:"Burundi",dial:"257",flag:"🇧🇮"}, CD:{name:"DR Congo",dial:"243",flag:"🇨🇩"},
    US:{name:"United States",dial:"1",flag:"🇺🇸"}, CA:{name:"Canada",dial:"1",flag:"🇨🇦"}, GB:{name:"United Kingdom",dial:"44",flag:"🇬🇧"},
    IN:{name:"India",dial:"91",flag:"🇮🇳"}, SG:{name:"Singapore",dial:"65",flag:"🇸🇬"}, AE:{name:"United Arab Emirates",dial:"971",flag:"🇦🇪"},
    ZA:{name:"South Africa",dial:"27",flag:"🇿🇦"}, NG:{name:"Nigeria",dial:"234",flag:"🇳🇬"}, GH:{name:"Ghana",dial:"233",flag:"🇬🇭"},
    AU:{name:"Australia",dial:"61",flag:"🇦🇺"}, DE:{name:"Germany",dial:"49",flag:"🇩🇪"}, FR:{name:"France",dial:"33",flag:"🇫🇷"},
    NL:{name:"Netherlands",dial:"31",flag:"🇳🇱"}, IT:{name:"Italy",dial:"39",flag:"🇮🇹"}, ES:{name:"Spain",dial:"34",flag:"🇪🇸"},
    ET:{name:"Ethiopia",dial:"251",flag:"🇪🇹"}, SS:{name:"South Sudan",dial:"211",flag:"🇸🇸"}, SO:{name:"Somalia",dial:"252",flag:"🇸🇴"},
    MW:{name:"Malawi",dial:"265",flag:"🇲🇼"}, ZM:{name:"Zambia",dial:"260",flag:"🇿🇲"}, ZW:{name:"Zimbabwe",dial:"263",flag:"🇿🇼"},
    MZ:{name:"Mozambique",dial:"258",flag:"🇲🇿"}, EG:{name:"Egypt",dial:"20",flag:"🇪🇬"}, SA:{name:"Saudi Arabia",dial:"966",flag:"🇸🇦"},
    HK:{name:"Hong Kong",dial:"852",flag:"🇭🇰"}, MY:{name:"Malaysia",dial:"60",flag:"🇲🇾"}, ID:{name:"Indonesia",dial:"62",flag:"🇮🇩"},
    PH:{name:"Philippines",dial:"63",flag:"🇵🇭"}, TH:{name:"Thailand",dial:"66",flag:"🇹🇭"}, VN:{name:"Vietnam",dial:"84",flag:"🇻🇳"},
    KR:{name:"South Korea",dial:"82",flag:"🇰🇷"}, NZ:{name:"New Zealand",dial:"64",flag:"🇳🇿"}, IE:{name:"Ireland",dial:"353",flag:"🇮🇪"},
    CH:{name:"Switzerland",dial:"41",flag:"🇨🇭"}, BE:{name:"Belgium",dial:"32",flag:"🇧🇪"}, SE:{name:"Sweden",dial:"46",flag:"🇸🇪"},
    NO:{name:"Norway",dial:"47",flag:"🇳🇴"}, DK:{name:"Denmark",dial:"45",flag:"🇩🇰"}, PL:{name:"Poland",dial:"48",flag:"🇵🇱"},
    PT:{name:"Portugal",dial:"351",flag:"🇵🇹"}, GR:{name:"Greece",dial:"30",flag:"🇬🇷"}, IL:{name:"Israel",dial:"972",flag:"🇮🇱"},
    QA:{name:"Qatar",dial:"974",flag:"🇶🇦"}, KW:{name:"Kuwait",dial:"965",flag:"🇰🇼"}, BH:{name:"Bahrain",dial:"973",flag:"🇧🇭"},
    JO:{name:"Jordan",dial:"962",flag:"🇯🇴"}, LB:{name:"Lebanon",dial:"961",flag:"🇱🇧"}, RU:{name:"Russia",dial:"7",flag:"🇷🇺"},
    AR:{name:"Argentina",dial:"54",flag:"🇦🇷"}, CL:{name:"Chile",dial:"56",flag:"🇨🇱"}, CO:{name:"Colombia",dial:"57",flag:"🇨🇴"},
    PE:{name:"Peru",dial:"51",flag:"🇵🇪"}, UY:{name:"Uruguay",dial:"598",flag:"🇺🇾"}, CU:{name:"Cuba",dial:"53",flag:"🇨🇺"},
    SN:{name:"Senegal",dial:"221",flag:"🇸🇳"}, CI:{name:"Côte d’Ivoire",dial:"225",flag:"🇨🇮"}, CM:{name:"Cameroon",dial:"237",flag:"🇨🇲"},
    MA:{name:"Morocco",dial:"212",flag:"🇲🇦"}, TN:{name:"Tunisia",dial:"216",flag:"🇹🇳"}, DZ:{name:"Algeria",dial:"213",flag:"🇩🇿"},
    SD:{name:"Sudan",dial:"249",flag:"🇸🇩"}, ER:{name:"Eritrea",dial:"291",flag:"🇪🇷"}, GM:{name:"The Gambia",dial:"220",flag:"🇬🇲"},
    BW:{name:"Botswana",dial:"267",flag:"🇧🇼"}, NA:{name:"Namibia",dial:"264",flag:"🇳🇦"}, LS:{name:"Lesotho",dial:"266",flag:"🇱🇸"},
    SZ:{name:"Eswatini",dial:"268",flag:"🇸🇿"}, MG:{name:"Madagascar",dial:"261",flag:"🇲🇬"}, MU:{name:"Mauritius",dial:"230",flag:"🇲🇺"},
    JP:{name:"Japan",dial:"81",flag:"🇯🇵"}, CN:{name:"China",dial:"86",flag:"🇨🇳"}, BR:{name:"Brazil",dial:"55",flag:"🇧🇷"},
    MX:{name:"Mexico",dial:"52",flag:"🇲🇽"}, TR:{name:"Türkiye",dial:"90",flag:"🇹🇷"}, PK:{name:"Pakistan",dial:"92",flag:"🇵🇰"},
  };
  const callingCodes = Object.entries(countryData).sort((a,b)=>b[1].dial.length-a[1].dial.length);
  const savedPaymentDetails = (() => { try { return JSON.parse(localStorage.getItem("ompath_payment_details") || "{}"); } catch { return {}; } })();
  const [phone, setPhone] = useState(() => savedPaymentDetails.phone || "");
  const [countryCode, setCountryCode] = useState(() => savedPaymentDetails.countryCode || "KE");
  const detectCountry = (value: string) => {
    const digits = value.replace(/\\D/g, "");
    const matches = callingCodes.filter(([, info]) => digits.startsWith(info.dial));
    if (!value.trim().startsWith("+") && matches.length === 0) return null;
    return matches.find(([code]) => code === countryCode)?.[0] || matches[0]?.[0] || "OTHER";
  };
  const countries = countryData;
  const [paymentMethod, setPaymentMethod] = useState<"mpesa" | "airtel" | "card">(() => savedPaymentDetails.countryCode && savedPaymentDetails.countryCode !== "KE" ? "card" : "mpesa");
  useEffect(() => {
    let active = true;
    const loadLocationDefault = async () => {
      if (savedPaymentDetails.countryCode) return;
      try {
        const response = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(3500) });
        if (!response.ok) return;
        const location = await response.json();
        const code = String(location?.country_code || "").toUpperCase();
        if (!active || !countryData[code]) return;
        setCountryCode(code);
        setPaymentMethod(code === "KE" ? "mpesa" : "card");
      } catch { /* Location lookup is optional; phone prefix and Kenya default remain available. */ }
    };
    void loadLocationDefault();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    try { localStorage.setItem("ompath_payment_details", JSON.stringify({ phone, countryCode })); } catch { /* best effort */ }
  }, [phone, countryCode]);
  const [state, setState] = useState<"idle" | "sending" | "waiting" | "error">("idle");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"buy" | "code">("buy");
  const [code, setCode] = useState("");
  const [issued, setIssued] = useState<AccessPass | null>(null);
  const [customCode, setCustomCode] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameMsg, setRenameMsg] = useState("");
  const { user, loading: authLoading } = useAuth();
  useEffect(() => {
    const metadata = user?.user_metadata as Record<string, unknown> | undefined;
    const savedPhone = typeof metadata?.payment_phone === "string" ? metadata.payment_phone : "";
    const savedCountry = typeof metadata?.payment_country === "string" ? metadata.payment_country : "";
    if (savedPhone && !phone) setPhone(savedPhone);
    if (savedCountry && countryData[savedCountry]) {
      setCountryCode(savedCountry);
      setPaymentMethod(savedCountry === "KE" ? "mpesa" : "card");
    }
  }, [user]);
  const [signingIn, setSigningIn] = useState(false);
  const [paystackEnabled, setPaystackEnabled] = useState(false);

  useEffect(() => { let active = true; void getSetting("paystack_enabled").then((value) => { if (active) setPaystackEnabled(value === "true"); }); return () => { active = false; }; }, []);

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
      await new Promise((r) => setTimeout(r, 5000));
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
    const ref = params.get("paystack_ref") || params.get("onekitty_ref");
    const returnedPlan = params.get("paystack_plan") || params.get("onekitty_plan") || plan.id;
    if (!ref) return;
    window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    setState("waiting");
    setMessage("Checkout returned. Confirming your payment securely…");
    void pollPayment(ref, returnedPlan);
  }, []);

  const startPaystackPayment = async () => {
    if (!user) { setState("error"); setMessage("Please sign in first."); return; }
    const digits = phone.replace(/\D/g, "");
    const detected = detectCountry(phone) || countryCode;
    if (digits.length < 9) { setState("error"); setMessage("Enter a complete mobile number."); return; }
    const resolvedCountry = detected === "OTHER" ? "OTHER" : detected;
    const internationalPhone = phone.trim().startsWith("+") || (countries[resolvedCountry] && digits.startsWith(countries[resolvedCountry].dial))
      ? digits : (countries[resolvedCountry]?.dial || "") + digits.replace(/^0/, "");
    if (user) {
      await supabase.auth.updateUser({ data: { payment_phone: internationalPhone, payment_country: resolvedCountry } });
    }
    const selectedMethod = resolvedCountry === "KE" ? paymentMethod : "card";
    setState("sending"); setMessage("");
    const { data, error } = await supabase.functions.invoke("initiate-paystack", {
      body: {
        method: selectedMethod,
        amount: plan.price || settings.price,
        package_type: plan.id,
        phone: internationalPhone,
        country_code: resolvedCountry,
        return_url: window.location.href,
      },
    });
    if (error || !data?.success) {
      setState("error");
      setMessage(data?.error || error?.message || "Could not start the Paystack payment.");
      return;
    }
    if (selectedMethod === "card") {
      if (!data.checkout_url) { setState("error"); setMessage("Paystack did not return a secure checkout link."); return; }
      window.location.assign(data.checkout_url);
      return;
    }
    setState("waiting");
    setMessage(data.provider_message || "Payment prompt sent. Approve it on your phone; you can stay on this page.");
    void pollPayment(data.transaction_id, plan.id);
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
    <div className={`not-prose ${bare ? "" : "my-8"}`}>
      <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0 p-5 sm:p-8">
            <div className="border-b border-border pb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">OmpathStudy / Secure checkout</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{headline || `Unlock the ${label}`}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{blurb || "Get full access to questions, answers, explanations and study resources with one subscription."}</p>
            </div>
            <div className="mt-5 grid grid-cols-2 rounded-lg border border-border p-1" role="tablist" aria-label="Checkout options">
              <button type="button" role="tab" aria-selected={mode === "buy"} onClick={() => setMode("buy")} className={`min-h-10 rounded-md px-3 text-sm font-semibold ${mode === "buy" ? "bg-foreground text-background" : "text-muted-foreground"}`}>Pay securely</button>
              <button type="button" role="tab" aria-selected={mode === "code"} onClick={() => setMode("code")} className={`min-h-10 rounded-md px-3 text-sm font-semibold ${mode === "code" ? "bg-foreground text-background" : "text-muted-foreground"}`}>I have a code</button>
            </div>
            {mode === "buy" && <>
            <div className="mt-6">
              <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-foreground">Choose your subscription</h3><span className="text-xs text-muted-foreground">Select one plan</span></div>
              <div className="mt-3 divide-y divide-border rounded-xl border border-border" role="radiogroup" aria-label="Choose a plan">
                {sorted.map((p) => { const rate=perMonth(p); const best=sorted.length>1 && rate!==null && rate===bestRate && baseRate!==null && rate<baseRate*0.9; const save=best&&baseRate?Math.round((1-rate!/baseRate)*100):0; const on=planId===p.id;
                  return <button key={p.id} type="button" role="radio" aria-checked={on} onClick={()=>setPlanId(p.id)} className={`flex min-h-[76px] w-full items-center justify-between gap-4 px-4 py-3 text-left first:rounded-t-xl last:rounded-b-xl ${on?"bg-primary/[0.06]":"bg-background hover:bg-muted/40"}`}>
                    <span className="flex min-w-0 items-start gap-3"><span className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on?"border-primary":"border-muted-foreground/50"}`}>{on&&<span className="h-2 w-2 rounded-full bg-primary"/>}</span><span className="min-w-0"><span className="block text-sm font-semibold text-foreground">{p.label||duration(p.days)}</span><span className="mt-1 block text-xs text-muted-foreground">{duration(p.days)} access{rate!==null&&sorted.length>1?` · about KES ${Math.round(rate)} per month`:""}</span></span></span>
                    <span className="shrink-0 text-right"><span className="block text-lg font-semibold tabular-nums text-foreground">KES {p.price.toLocaleString("en-KE")}</span>{best&&<span className="mt-0.5 block text-[11px] font-medium text-primary">Save {save}%</span>}</span>
                  </button>; })}
              </div>
            </div>
            <div className="mt-7 border-t border-border pt-6">
              <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-foreground">Payment details</h3><span className="text-xs text-muted-foreground">Final step</span></div>
              {!user&&!authLoading&&<div className="mt-4 rounded-xl border border-border bg-background p-4"><p className="text-sm font-semibold text-foreground">Sign in to continue</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Your subscription will be linked to your account and available on your other devices.</p><button type="button" onClick={startGoogle} disabled={signingIn} className="mt-4 flex min-h-12 w-full items-center justify-center rounded-lg bg-foreground px-4 py-3 text-sm font-semibold text-background disabled:opacity-60">{signingIn?"Connecting…":"Continue with Google"}</button><button type="button" onClick={()=>{setMode("code");setState("idle");}} className="mt-3 w-full text-center text-xs font-medium text-primary underline underline-offset-4">Already have a pass code?</button></div>}
              <div className={`mt-4 space-y-4 ${!user&&!authLoading?"pointer-events-none opacity-40":""}`}>
                <div><label htmlFor="pay-phone" className="mb-2 block text-sm font-medium text-foreground">Mobile number</label><div className="flex min-h-12 items-center rounded-lg border border-border bg-background px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15"><span className="mr-3 text-lg" aria-hidden="true">{countries[countryCode]?.flag||"🌍"}</span><input id="pay-phone" value={phone} onChange={(e)=>{const next=e.target.value.replace(/[^0-9+ ]/g,"");setPhone(next);const detected=detectCountry(next);if(detected){setCountryCode(detected);if(detected!=="KE")setPaymentMethod("card");else if(paymentMethod==="card")setPaymentMethod("mpesa");}setState("idle");setMessage("");}} inputMode="tel" autoComplete="tel" placeholder={countryCode==="KE"?"07XX XXX XXX or +254…":`+${countries[countryCode]?.dial || ""} mobile number` } className="min-w-0 flex-1 bg-transparent py-3 text-base text-foreground outline-none placeholder:text-muted-foreground/60"/><span className="ml-2 shrink-0 text-xs text-muted-foreground">{countries[countryCode]?.name||"International"}</span></div><p className="mt-2 text-xs leading-5 text-muted-foreground">Enter the number that should receive your payment request.</p></div>
                <div><p className="mb-2 text-sm font-medium text-foreground">Payment method</p>{countryCode==="KE"?<div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border" role="group" aria-label="Payment method">{([["mpesa","M-Pesa"],["airtel","Airtel Money"],["card","Debit / credit card"]] as const).map(([method,title])=><button key={method} type="button" onClick={()=>setPaymentMethod(method)} aria-pressed={paymentMethod===method} className={`min-h-12 border-r border-border px-2 py-3 text-xs font-semibold last:border-r-0 sm:text-sm ${paymentMethod===method?"bg-foreground text-background":"bg-background text-muted-foreground hover:bg-muted/50"}`}>{title}</button>)}</div>:<div className="rounded-lg border border-border bg-muted/30 px-4 py-3"><p className="text-sm font-semibold text-foreground">Debit or credit card</p><p className="mt-1 text-xs text-muted-foreground">Secure card payment through Paystack.</p></div>}</div>
                {!paystackEnabled&&<p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">Online payments are temporarily unavailable. Please use an existing pass code or try again later.</p>}
                <button type="button" onClick={startPaystackPayment} disabled={busy||!user||!paystackEnabled||phone.replace(/\D/g,"").length<9} className="flex min-h-14 w-full items-center justify-center rounded-lg bg-primary px-5 py-4 text-base font-semibold text-primary-foreground transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">{busy?(state==="waiting"?"Waiting for payment confirmation…":"Starting payment…"):"Continue to secure payment"}</button>
                <p className="text-center text-xs leading-5 text-muted-foreground">{paymentMethod==="card"||countryCode!=="KE"?"You will continue to Paystack’s secure card checkout.":"A payment prompt will be sent to your phone. Approve it using your mobile-money PIN."}</p>
              </div>
            </div>
            {busy&&<div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground"><span className="inline-flex items-center gap-2 font-semibold text-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Payment in progress</span><p className="mt-2">Keep this page open while we confirm your payment. Your access will unlock automatically.</p></div>}
            {message&&<p role="status" className={`mt-4 rounded-lg px-3 py-3 text-sm ${state==="error"?"bg-destructive/10 text-destructive":"bg-primary/10 text-foreground"}`}>{message}</p>}
            <p className="mt-5 text-xs leading-5 text-muted-foreground">Card payments are handled by Paystack. Mobile-money requests are confirmed before access is activated. <Link to="/account" className="font-medium text-primary underline underline-offset-4">Manage your subscription</Link>.</p>
            </>}
          </section>
          {mode === "buy" && <aside className="border-t border-border bg-muted/25 p-5 sm:p-8 lg:border-l lg:border-t-0"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Order summary</p><div className="mt-5 border-b border-border pb-5"><p className="text-sm font-semibold text-foreground">{plan.label||duration(plan.days)} subscription</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Access across OmpathStudy for {duration(plan.days).toLowerCase()}.</p></div><div className="flex items-center justify-between gap-3 py-5"><span className="text-sm text-muted-foreground">Total due</span><span className="text-xl font-semibold tabular-nums text-foreground">KES {(plan.price||settings.price).toLocaleString("en-KE")}</span></div><div className="rounded-lg border border-border bg-background p-4"><p className="text-sm font-semibold text-foreground">Included with your plan</p><ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground"><li>Questions and full answer keys</li><li>Explanations and study resources</li><li>Access on your signed-in devices</li>{plan.download&&<li>PDF handouts and downloads</li>}</ul></div><p className="mt-5 text-xs leading-5 text-muted-foreground">Your selected plan and full amount are shown before you pay. No hidden checkout charges.</p></aside>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground sm:px-8"><span>OMPATHSTUDY</span><span>Secure checkout · Support available through your account</span></div>
      </div>
      {mode==="code"&&<div className="mx-auto mt-4 max-w-xl rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between gap-3"><h3 className="text-base font-semibold text-foreground">Redeem an access code</h3><button type="button" onClick={()=>setMode("buy")} className="text-xs font-medium text-primary underline underline-offset-4">Back to payment</button></div><label htmlFor="pass-code" className="mt-4 block text-sm font-medium text-foreground">Pass code</label><input id="pass-code" value={code} onChange={(e)=>setCode(normalizePassCode(e.target.value))} placeholder="OM-XXXXXXXX" className="mt-2 min-h-12 w-full rounded-lg border border-border bg-background px-3 font-mono text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"/><button type="button" onClick={redeem} disabled={state==="sending"||!code.trim()} className="mt-3 min-h-12 w-full rounded-lg bg-foreground px-4 py-3 text-sm font-semibold text-background disabled:opacity-60">{state==="sending"?"Checking code…":"Unlock with code"}</button>{message&&<p role="status" className={`mt-3 rounded-lg px-3 py-2 text-sm ${state==="error"?"bg-destructive/10 text-destructive":"bg-primary/10 text-foreground"}`}>{message}</p>}</div>}
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
