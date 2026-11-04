import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://www.ompathstudy.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const normalizePhone = (value: string) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (/^254\d{9}$/.test(digits)) return digits;
  if (/^0\d{9}$/.test(digits)) return "254" + digits.slice(1);
  if (/^\d{9}$/.test(digits)) return "254" + digits;
  return "";
};
const safeText = (v: unknown, max = 200) => typeof v === "string" ? v.slice(0, max) : "";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const headers = { ...cors, "Access-Control-Allow-Origin": origin === "https://ompathstudy.com" ? origin : cors["Access-Control-Allow-Origin"] };
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authCode = Deno.env.get("ONEKITTY_AUTH_CODE") || "";
    const kittyId = Number(Deno.env.get("ONEKITTY_KITTY_ID") || 0);
    if (!supabaseUrl || !serviceKey) return json({ success: false, error: "Supabase backend is not configured" }, 503);
    if (!authCode || !Number.isInteger(kittyId) || kittyId <= 0) {
      return json({ success: false, error: "OneKitty is not configured yet. Add ONEKITTY_AUTH_CODE and ONEKITTY_KITTY_ID to Edge Function secrets." }, 503);
    }

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ success: false, error: "Sign in required" }, 401);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return json({ success: false, error: "Invalid session" }, 401);
    const { data: isAdmin, error: roleError } = await admin.rpc("has_role", { _user_id: auth.user.id, _role: "admin" });
    if (roleError || !isAdmin) return json({ success: false, error: "Administrator access required" }, 403);

    const body = await req.json().catch(() => ({}));
    if (body.action === "status") {
      const { data, error } = await admin.from("onekitty_test_payments")
        .select("id,external_ref,amount,currency,phone_number,payment_mode,requested_channel_code,provider_payment_ref,request_reference,checkout_url,callback_status,callback_result_code,callback_result_desc,callback_channel_code,callback_transaction_code,callback_received_at,callback_verified,created_at")
        .order("created_at", { ascending: false }).limit(25);
      if (error) throw error;
      return json({ success: true, payments: data || [] });
    }

    const amount = Number(body.amount);
    const phone = normalizePhone(body.phone_number);
    const mode = body.mode === "checkout" ? "CHECKOUT" : body.mode === "stk" ? "STK_REQUEST" : "";
    const channel = String(body.channel_code || "63902");
    if (!Number.isFinite(amount) || amount < 1 || amount > 1000000 || !Number.isInteger(amount)) {
      return json({ success: false, error: "Enter a whole-number amount between KES 1 and KES 1,000,000." }, 400);
    }
    if (!phone) return json({ success: false, error: "Enter a valid Kenyan mobile number." }, 400);
    if (!mode) return json({ success: false, error: "Choose hosted checkout or STK push." }, 400);
    if (mode === "STK_REQUEST" && !["63902", "63903", "63907"].includes(channel)) {
      return json({ success: false, error: "Choose M-Pesa, Airtel Money or T-Kash for STK push." }, 400);
    }

    const externalRef = crypto.randomUUID();
    const paymentRef = "OMPATH-TEST-" + externalRef.slice(0, 8).toUpperCase();
    const callbackUrl = supabaseUrl + "/functions/v1/onekitty-callback";
    const redirectUrl = "https://www.ompathstudy.com/admin/onekitty?onekitty_return=1&ref=" + encodeURIComponent(externalRef);
    const payload: Record<string, unknown> = {
      auth_code: authCode,
      kitty_id: kittyId,
      amount,
      phone_number: phone,
      country_code: "KE",
      currency_code: "KES",
      channel_code: mode === "CHECKOUT" ? 0 : Number(channel),
      first_name: safeText(auth.user.user_metadata?.first_name || auth.user.user_metadata?.name || "Ompath", 80),
      second_name: safeText(auth.user.user_metadata?.last_name || "Admin", 80),
      payer_email: auth.user.email || undefined,
      payment_ref: paymentRef,
      external_ref: externalRef,
      show_names: false,
      show_number: false,
      is_checkout: mode === "CHECKOUT",
    };
    if (mode === "CHECKOUT") payload.redirect_url = redirectUrl;

    const upstream = await fetch("https://apisalticon.onekitty.co.ke/kitty/api/contribute/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok || result?.status === false) {
      console.error("OneKitty initiation rejected", upstream.status, result?.message || "");
      return json({ success: false, error: safeText(result?.message, 300) || "OneKitty could not start this payment.", provider_status: upstream.status }, 502);
    }

    const data = result?.data || {};
    const checkoutUrl = typeof data.checkout_url === "string" ? data.checkout_url : "";
    if (mode === "CHECKOUT" && (!checkoutUrl || !/^https:\/\//i.test(checkoutUrl))) {
      return json({ success: false, error: "OneKitty did not return a valid hosted checkout URL. No redirect was made.", provider_message: safeText(result?.message, 200) }, 502);
    }

    const { error: insertError } = await admin.from("onekitty_test_payments").insert({
      user_id: auth.user.id,
      external_ref: externalRef,
      kitty_id: kittyId,
      amount,
      currency: "KES",
      phone_number: phone,
      payment_mode: mode,
      requested_channel_code: mode === "STK_REQUEST" ? channel : "checkout-selected",
      provider_payment_ref: safeText(data.payment_ref, 120) || null,
      request_reference: safeText(data.request_reference, 160) || null,
      checkout_url: checkoutUrl || null,
    });
    if (insertError) {
      console.error("OneKitty payment record insert failed", insertError.message);
      return json({ success: false, error: "OneKitty created a request, but OmpathStudy could not save its tracking record. Contact the administrator before retrying.", external_ref: externalRef }, 500);
    }

    return json({
      success: true,
      external_ref: externalRef,
      mode,
      checkout_url: checkoutUrl || null,
      provider_message: safeText(result?.message, 250) || "Payment request accepted by OneKitty.",
      next_step: mode === "CHECKOUT" ? "Open the hosted checkout and select an available payment method." : "Approve the payment prompt on the phone.",
    });
  } catch (error) {
    console.error("OneKitty initiation error", error);
    return json({ success: false, error: "Unexpected payment integration error." }, 500);
  }
});
