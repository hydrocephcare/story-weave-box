import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function toHex(bytes: Uint8Array): string { return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(""); }
function constantTimeHexEqual(a: string, b: string): boolean {
  if (!/^[0-9a-f]{128}$/i.test(a) || !/^[0-9a-f]{128}$/i.test(b)) return false;
  let mismatch = 0; for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i); return mismatch === 0;
}
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))));
}
async function verifyNew(header: string, raw: string, secret: string): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(",").map((v) => v.trim()), timestamp = parts.find((v) => v.startsWith("t="))?.slice(2) || "";
  if (!/^\d{10}$/.test(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;
  const signatures = parts.filter((v) => v.startsWith("v1=")).map((v) => v.slice(3).split(":").pop() || "");
  const expected = await hmacHex(secret, timestamp + "." + raw);
  return signatures.some((v) => constantTimeHexEqual(v, expected));
}
async function verifyLegacy(header: string, raw: string, secret: string): Promise<boolean> {
  return !!header && !!secret && constantTimeHexEqual(header.trim(), await hmacHex(secret, raw));
}
Deno.serve(async (req) => {
  if (req.method === "GET") return json({ success: true, endpoint: "paystack-webhook", ready: true });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  try {
    const raw = await req.text(), secretKey = Deno.env.get("PAYSTACK_SECRET_KEY") || "", signingSecret = Deno.env.get("PAYSTACK_WEBHOOK_SECRET") || "";
    if (!secretKey) return json({ success: false, error: "Webhook verification is not configured." }, 503);
    const newHeader = req.headers.get("paystack-signature") || "", legacyHeader = req.headers.get("x-paystack-signature") || "";
    const validNew = signingSecret ? await verifyNew(newHeader, raw, signingSecret) : false;
    const validLegacy = await verifyLegacy(legacyHeader, raw, secretKey);
    if (!validNew && !validLegacy) return json({ success: false, error: "Invalid webhook signature." }, 401);
    let event: Record<string, unknown>;
    try { const parsed = JSON.parse(raw); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(); event = parsed as Record<string, unknown>; }
    catch { return json({ success: false, error: "Malformed webhook body." }, 400); }
    const eventName = String(event.event || "");
    if (!["charge.success", "charge.failed"].includes(eventName)) return json({ success: true, ignored: true });
    const eventData = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : {};
    const reference = String(eventData.reference || "").trim();
    if (!reference) return json({ success: true, ignored: true, reason: "Missing transaction reference." });
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "", serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceKey) return json({ success: false, error: "Backend credentials not configured." }, 503);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: payment, error: lookupError } = await admin.from("payments").select("id,amount,payment_status,transaction_id,provider_txn_id").eq("transaction_id", reference).maybeSingle();
    if (lookupError) throw lookupError;
    if (!payment || !String(payment.provider_txn_id || "").startsWith("paystack:")) return json({ success: true, ignored: true, reason: "No matching local Paystack payment." });
    if (payment.payment_status === "completed") return json({ success: true, duplicate: true });
    const response = await fetch("https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference), { headers: { Authorization: "Bearer " + secretKey, Accept: "application/json" } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.status !== true || !body?.data) return json({ success: false, error: "Could not verify transaction with Paystack." }, 502);
    const txn = body.data;
    if (String(txn.reference || "") !== reference || Number(txn.amount) !== Math.round(Number(payment.amount) * 100) || String(txn.currency || "").toUpperCase() !== "KES") {
      console.error("Paystack verified transaction did not match local payment."); return json({ success: true, ignored: true, reason: "Verified transaction did not match local payment." });
    }
    const status = String(txn.status || "").toLowerCase();
    if (status === "success" || (status === "failed" && eventName === "charge.failed")) {
      const { error: updateError } = await admin.from("payments").update({ payment_status: status === "success" ? "completed" : "failed", updated_at: new Date().toISOString() }).eq("id", payment.id).eq("payment_status", "pending");
      if (updateError) throw updateError;
      return json({ success: true, status, reference });
    }
    return json({ success: true, pending: true, reference });
  } catch (error) { console.error("Paystack webhook error:", error); return json({ success: false, error: "Webhook processing failed." }, 500); }
});