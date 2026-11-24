import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
function normalizePhone(value: unknown): string { const digits = String(value || "").replace(/\D/g, ""); return digits.length >= 9 && digits.length <= 15 ? "+" + digits : ""; }
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "", serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", secretKey = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
    if (!supabaseUrl || !serviceKey || !secretKey) return json({ success: false, error: "Paystack is not configured on the server." }, 503);
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!bearer) return json({ success: false, error: "Sign in required." }, 401);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: auth, error: authError } = await admin.auth.getUser(bearer);
    if (authError || !auth.user?.id || !auth.user.email) return json({ success: false, error: "Your session has expired. Sign in again." }, 401);
    const body = await req.json().catch(() => ({}));
    const method = String(body.method || "card").toLowerCase(), countryCode = String(body.country_code || "KE").toUpperCase();
    const pricingCountry = String(body.pricing_country || countryCode || "KE").toUpperCase();
    const phone = normalizePhone(body.phone), packageType = String(body.package_type || "annual").slice(0, 80);
    if (!["card", "mpesa", "airtel"].includes(method)) return json({ success: false, error: "Choose Card, M-Pesa or Airtel Money." }, 400);
    if (!phone) return json({ success: false, error: "Enter a valid mobile number with country code." }, 400);
    const { data: planSetting, error: planError } = await admin.from("app_settings").select("value").eq("key", "access_plans").maybeSingle();
    if (planError) return json({ success: false, error: "Could not load the current subscription price. Please try again." }, 503);
    let plans: Array<{ id: string; price?: number; internationalPrice?: number }> = [];
    try { plans = JSON.parse(String(planSetting?.value || "[]")); } catch { plans = []; }
    const selectedPlan = plans.find((p) => p.id === packageType);
    if (!selectedPlan) return json({ success: false, error: "That subscription plan is no longer available. Refresh the page and try again." }, 400);
    const currency = pricingCountry === "KE" ? "KES" : "USD";
    const amount = currency === "KES" ? Number(selectedPlan.price) : Number(selectedPlan.internationalPrice ?? 21);
    if (!Number.isInteger(amount) || amount < (currency === "USD" ? 2 : 3) || amount > 1000000) return json({ success: false, error: "The configured subscription price is invalid." }, 400);
    if ((pricingCountry !== "KE" || countryCode !== "KE") && method !== "card") return json({ success: false, error: "International visitors and non-Kenyan numbers must use card checkout." }, 400);
    const reference = "OMP-" + crypto.randomUUID();
    const callbackUrl = new URL("https://www.ompathstudy.com/");
    try {
      const candidate = new URL(String(body.return_url || ""));
      if (candidate.protocol === "https:" && ["www.ompathstudy.com", "ompathstudy.com"].includes(candidate.hostname)) {
        callbackUrl.pathname = candidate.pathname; callbackUrl.search = candidate.search; callbackUrl.hash = candidate.hash;
      }
    } catch { /* use canonical homepage */ }
    callbackUrl.searchParams.set("paystack_ref", reference); callbackUrl.searchParams.set("paystack_plan", packageType);
    const { error: insertError } = await admin.from("payments").insert({
      phone_number: phone, amount, currency, pricing_country: pricingCountry, payment_status: "pending", transaction_id: reference, provider_txn_id: "paystack:" + reference,
      package_type: packageType, buyer_email: auth.user.email.toLowerCase(),
      buyer_name: String(auth.user.user_metadata?.full_name || auth.user.user_metadata?.name || "").slice(0, 120) || null, user_id: auth.user.id
    });
    if (insertError) { console.error("Paystack pending payment insert failed:", insertError.message); return json({ success: false, error: "Could not create your payment record. Please try again." }, 500); }
    const isCard = method === "card";
    const payload: Record<string, unknown> = {
      email: auth.user.email, amount: String(Math.round(amount * 100)), currency, reference,
      metadata: { user_id: auth.user.id, package_type: packageType, source: "ompathstudy" }
    };
    if (isCard) { payload.channels = ["card"]; payload.callback_url = callbackUrl.toString(); }
    else payload.mobile_money = { phone, provider: method === "mpesa" ? "mpesa" : "atl" };
    const upstream = await fetch("https://api.paystack.co/" + (isCard ? "transaction/initialize" : "charge"), {
      method: "POST", headers: { Authorization: "Bearer " + secretKey, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload)
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok || result?.status !== true) {
      await admin.from("payments").update({ payment_status: "failed", updated_at: new Date().toISOString() }).eq("transaction_id", reference);
      console.error("Paystack initiation failed:", upstream.status, result?.message || "unknown provider response");
      return json({ success: false, error: String(result?.message || "Paystack could not start the payment.").slice(0, 240) }, 502);
    }
    if (isCard) {
      const checkoutUrl = String(result?.data?.authorization_url || "");
      if (!/^https:\/\/checkout\.paystack\.com\//i.test(checkoutUrl)) {
        await admin.from("payments").update({ payment_status: "failed", updated_at: new Date().toISOString() }).eq("transaction_id", reference);
        return json({ success: false, error: "Paystack did not return a valid secure checkout URL." }, 502);
      }
      return json({ success: true, method, transaction_id: reference, checkout_url: checkoutUrl, provider_message: "Secure Paystack checkout is ready." });
    }
    return json({ success: true, method, transaction_id: reference, provider_status: String(result?.data?.status || "pending").toLowerCase(), provider_message: String(result?.data?.display_text || result?.message || "Approve the payment prompt on your phone.").slice(0, 240) });
  } catch (error) { console.error("Paystack initiation error:", error); return json({ success: false, error: "Could not start secure Paystack checkout." }, 500); }
});