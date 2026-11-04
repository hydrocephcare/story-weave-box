import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceKey) return json({ success: false }, 503);
    const body = await req.json();
    const externalRef = String(body?.third_party_reference || "").trim();
    const resultCode = String(body?.result_code ?? "").trim();
    const kittyId = Number(body?.kitty_id);
    const amount = Number(body?.amount);
    const currency = String(body?.currency || "KES").toUpperCase();
    if (!externalRef || !resultCode || !Number.isFinite(amount) || !Number.isInteger(kittyId)) {
      return json({ success: false, error: "Incomplete callback payload" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: row, error: findError } = await admin.from("onekitty_test_payments")
      .select("id,amount,kitty_id,currency,callback_received_at")
      .eq("external_ref", externalRef).maybeSingle();
    if (findError) throw findError;
    if (!row || Number(row.amount) !== amount || Number(row.kitty_id) !== kittyId || row.currency !== currency) {
      console.error("OneKitty callback did not match an existing test request", externalRef);
      return json({ success: false, error: "Payment reference or amount mismatch" }, 409);
    }
    if (row.callback_received_at) return json({ success: true, duplicate: true }, 200);

    const successReported = resultCode === "0" || resultCode === "00";
    const { error: updateError } = await admin.from("onekitty_test_payments").update({
      callback_status: successReported ? "callback_reported_success" : "callback_reported_failure",
      callback_result_code: resultCode.slice(0, 30),
      callback_result_desc: String(body?.result_desc || "").slice(0, 500),
      callback_channel_code: String(body?.channel_code || "").slice(0, 30),
      callback_transaction_code: String(body?.transaction_code || "").slice(0, 100),
      provider_payment_ref: String(body?.payment_ref || "").slice(0, 120) || null,
      request_reference: String(body?.request_reference || "").slice(0, 160) || null,
      callback_received_at: new Date().toISOString(),
      callback_verified: false,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    if (updateError) throw updateError;

    // The supplied external API spec does not document a signature or a
    // transaction-verification endpoint. This callback is recorded as reported,
    // never as verified, and is not connected to entitlements or paid access.
    return json({ success: true, recorded: true, verified: false }, 200);
  } catch (error) {
    console.error("OneKitty callback processing error", error);
    return json({ success: false, error: "Callback processing failed" }, 500);
  }
});
