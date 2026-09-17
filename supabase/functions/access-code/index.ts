import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return "OM-" + Array.from(bytes).map((b) => ALPHABET[b % ALPHABET.length]).join("").slice(0, 8);
}

/**
 * Canonical form of a pass code: uppercase, letters and digits only.
 * Readers type their own renamed codes with spaces, dashes or lowercase, which
 * used to make a perfectly valid pass come back as "code was not found".
 */
function canon(value: unknown): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Find a grant by exact code, then by canonical (punctuation-insensitive) match. */
async function findGrant(supabase: ReturnType<typeof createClient>, raw: string) {
  const typed = String(raw || "").trim().toUpperCase();
  const key = canon(typed);
  if (!key) return null;

  const { data: exact } = await supabase.from("access_grants").select("*").eq("code", typed).maybeSingle();
  if (exact) return exact;

  const { data: all } = await supabase.from("access_grants").select("*").limit(5000);
  return (all || []).find((g: Record<string, unknown>) => canon(g.code) === key) ?? null;
}

interface Plan { id: string; label: string; price: number; days: number; download?: boolean }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("Backend credentials not configured");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
    const { data: authData } = bearer ? await supabase.auth.getUser(bearer) : { data: { user: null } };
    const authUser = authData.user;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "verify");

    if (action === "list") {
      // Masked summary for the admin dashboard — never returns full codes.
      const { data } = await supabase
        .from("access_grants")
        .select("code, plan, amount, expires_at, redeem_count, created_at")
        .order("created_at", { ascending: false })
        .limit(25);
      return json({
        passes: (data || []).map((g: Record<string, unknown>) => ({
          code: String(g.code).slice(0, 3) + "•••" + String(g.code).slice(-3),
          plan: g.plan,
          amount: g.amount,
          expires_at: g.expires_at,
          redeem_count: g.redeem_count,
        })),
      });
    }

    if (action === "verify") {
      const email = authUser?.email?.trim().toLowerCase() || null;
      const userId = authUser?.id || null;
      const code = String(body?.code || "").trim().toUpperCase();
      if (!code) return json({ valid: false, error: "Code required" }, 400);

      const grant = await findGrant(supabase, code);

      if (!grant) return json({ valid: false, error: "That code was not found." }, 200);
      if (new Date(grant.expires_at).getTime() < Date.now()) {
        return json({ valid: false, expired: true, error: "That pass has expired." }, 200);
      }
      if ((grant.user_id && grant.user_id !== userId) || (grant.email && grant.email.toLowerCase() !== email)) {
        return json({ valid: false, error: "That pass belongs to another email account." }, 200);
      }

      await supabase
        .from("access_grants")
        .update({
          redeem_count: (grant.redeem_count || 0) + 1,
          last_redeemed_at: new Date().toISOString(),
          ...(email && !grant.email ? { email } : {}),
          ...(userId && !grant.user_id ? { user_id: userId } : {}),
        })
        .eq("id", grant.id);

      return json({
        valid: true,
        code: grant.code,
        plan: grant.plan,
        expires_at: grant.expires_at,
        allow_download: grant.allow_download !== false,
      });
    }

    if (action === "account") {
      // Subscriber account page: look a pass up by code, signed-in user or email.
      const codeIn = String(body?.code || "").trim();
      const userId = authUser?.id || "";
      const email = authUser?.email?.trim().toLowerCase() || "";

      let grant: Record<string, unknown> | null = null;
      if (userId) {
        const { data } = await supabase
          .from("access_grants").select("*").eq("user_id", userId)
          .order("expires_at", { ascending: false }).limit(1).maybeSingle();
        grant = data ?? null;
      }
      if (!grant && email) {
        const { data } = await supabase
          .from("access_grants").select("*").ilike("email", email)
          .order("expires_at", { ascending: false }).limit(1).maybeSingle();
        grant = data ?? null;
      }
      if (!grant && codeIn) {
        const byCode = await findGrant(supabase, codeIn);
        if (byCode && (!byCode.user_id || byCode.user_id === userId) && (!byCode.email || byCode.email.toLowerCase() === email)) {
          grant = byCode;
        }
      }
      if (!grant) return json({ found: false });

      return json({
        found: true,
        code: grant.code,
        plan: grant.plan,
        amount: grant.amount,
        expires_at: grant.expires_at,
        expired: new Date(String(grant.expires_at)).getTime() < Date.now(),
        allow_download: grant.allow_download !== false,
      });
    }

    if (action === "rename") {
      const code = String(body?.code || "").trim().toUpperCase();
      const raw = String(body?.new_code || "").trim().toUpperCase();
      const newCode = raw.replace(/\s+/g, "-").replace(/[^A-Z0-9-]/g, "").replace(/^-+|-+$/g, "");
      if (!code || !newCode) return json({ success: false, error: "Both the current and new code are required." }, 400);
      if (newCode.length < 6 || newCode.length > 24) {
        return json({ success: false, error: "Choose a code between 6 and 24 characters (letters, numbers, dashes)." }, 200);
      }

      const grant = await findGrant(supabase, code);
      if (!grant) return json({ success: false, error: "That pass was not found." }, 200);
      if (new Date(grant.expires_at).getTime() < Date.now()) {
        return json({ success: false, error: "That pass has expired." }, 200);
      }
      if (grant.user_id && authUser?.id !== grant.user_id) {
        return json({ success: false, error: "Sign in to the account linked to this subscription to change its code." }, 200);
      }
      if (canon(newCode) !== canon(grant.code)) {
        const clash = await findGrant(supabase, newCode);
        if (clash) return json({ success: false, error: "That code is already taken — pick another." }, 200);
      }

      const { data: updated, error: updateError } = await supabase
        .from("access_grants")
        .update({ code: newCode })
        .eq("id", grant.id)
        .select()
        .maybeSingle();
      if (updateError || !updated) return json({ success: false, error: "Could not change the code." }, 200);

      return json({
        success: true,
        code: updated.code,
        plan: updated.plan,
        expires_at: updated.expires_at,
        allow_download: updated.allow_download !== false,
      });
    }

    if (action === "issue") {
      const transactionId = String(body?.transaction_id || "").trim();
      const emailIn = authUser?.email?.trim().toLowerCase() || null;
      const userIdIn = authUser?.id || null;
      if (!userIdIn || !emailIn) return json({ success: false, error: "Sign in before activating a subscription." }, 401);
      if (!transactionId) return json({ success: false, error: "transaction_id required" }, 400);

      const { data: payment } = await supabase
        .from("payments")
        .select("*")
        .eq("transaction_id", transactionId)
        .maybeSingle();

      if (!payment) return json({ success: false, error: "Payment not found" }, 404);
      if (payment.payment_status !== "completed") {
        return json({ success: false, error: "Payment not completed", status: payment.payment_status }, 200);
      }

      // Already issued for this payment? Return it (idempotent).
      const { data: existing } = await supabase
        .from("access_grants")
        .select("*")
        .eq("payment_id", payment.id)
        .maybeSingle();
      if (existing) {
        if (!existing.user_id || !existing.email) {
          await supabase.from("access_grants").update({ user_id: userIdIn, email: emailIn }).eq("id", existing.id);
        }
        return json({
          success: true,
          code: existing.code,
          plan: existing.plan,
          expires_at: existing.expires_at,
          allow_download: existing.allow_download !== false,
        });
      }

      // Resolve plan config from app_settings
      const { data: setting } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "access_plans")
        .maybeSingle();

      let plans: Plan[] = [];
      try { plans = JSON.parse(setting?.value || "[]"); } catch { plans = []; }

      const requestedPlan = String(body?.plan || payment.package_type || "semester");
      const plan =
        plans.find((p) => p.id === requestedPlan) ??
        plans.find((p) => Number(p.price) === Number(payment.amount)) ??
        { id: "semester", label: "Semester pass (3 months)", price: Number(payment.amount || 0), days: 90, download: true };

      const expires = new Date(Date.now() + Math.max(1, Number(plan.days) || 1) * 86_400_000).toISOString();

      let code = newCode();
      let inserted = null;
      for (let attempt = 0; attempt < 4 && !inserted; attempt++) {
        const { data, error } = await supabase
          .from("access_grants")
          .insert({
            code,
            plan: plan.id,
            expires_at: expires,
            payment_id: payment.id,
            phone_number: payment.phone_number,
            amount: Number(payment.amount || 0),
            allow_download: plan.download !== false,
            email: emailIn,
            user_id: userIdIn,
          })
          .select()
          .maybeSingle();
        if (data) { inserted = data; break; }
        if (error && !String(error.message).includes("duplicate")) throw error;
        code = newCode();
      }

      if (!inserted) return json({ success: false, error: "Could not issue a pass" }, 500);

      return json({
        success: true,
        code: inserted.code,
        plan: inserted.plan,
        expires_at: inserted.expires_at,
        allow_download: inserted.allow_download !== false,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error: unknown) {
    console.error("access-code error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
