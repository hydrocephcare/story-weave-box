// Central OmpathStudy AI gateway.
// Keeps provider credentials and model routing on Supabase; Neon remains the source
// of truth for user identity and AI entitlements. Existing provider rotation/fallback
// is reused from ../_shared/aiChat.js (Groq + Gemini, multiple keys, cooldowns).
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";
import { chatText } from "../_shared/aiChat.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://www.ompathstudy.com",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const JWKS_URL = Deno.env.get("NEON_AUTH_JWKS_URL")
  || "https://ep-dry-haze-benks3ew.neonauth.c-9.us-east-2.aws.neon.tech/neondb/auth/.well-known/jwks.json";
const DATA_API_URL = (Deno.env.get("NEON_DATA_API_URL")
  || "https://ep-dry-haze-benks3ew.apirest.c-9.us-east-2.aws.neon.tech/neondb/rest/v1").replace(/\/+$/, "");
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

async function authenticate(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwks);
    if (!payload.sub || !/^[0-9a-f-]{36}$/i.test(String(payload.sub))) return null;
    return { token, userId: String(payload.sub) };
  } catch {
    return null;
  }
}

async function consumeEntitlement(token: string, feature: string) {
  const response = await fetch(`${DATA_API_URL}/rpc/consume_feature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ p_feature: feature, p_units: 1 }),
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 401 || response.status === 403) {
    return { ok: false as const, status: 401, reason: "invalid_session" };
  }
  if (!response.ok) return { ok: false as const, status: 503, reason: "verification_unavailable" };
  const result = await response.json();
  if (!result?.allowed) return { ok: false as const, status: 402, reason: "limit", quota: result };
  return { ok: true as const, quota: result };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const origin = req.headers.get("origin") || "";
  if (origin && !["https://www.ompathstudy.com", "https://ompathstudy.com", "https://stories.ompathstudy.com"].includes(origin)) {
    return json({ error: "origin_not_allowed" }, 403);
  }

  const auth = await authenticate(req);
  if (!auth) return json({ error: "login_required" }, 401);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "invalid_json" }, 400);

  const feature = String(body.feature || "").trim();
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(feature)) return json({ error: "feature_required" }, 400);

  const messages = Array.isArray(body.messages) ? body.messages.slice(-20) : null;
  if (!messages?.length) return json({ error: "messages_required" }, 400);
  const cleanMessages = [];
  for (const message of messages) {
    if (!message || !["system", "user", "assistant"].includes(message.role)) continue;
    const content = typeof message.content === "string" ? message.content.slice(0, 12000) : "";
    if (content) cleanMessages.push({ role: message.role, content });
  }
  if (!cleanMessages.length || !cleanMessages.some((m) => m.role === "user")) {
    return json({ error: "valid_user_message_required" }, 400);
  }

  const entitlement = await consumeEntitlement(auth.token, feature);
  if (!entitlement.ok) return json({
    error: entitlement.reason,
    upgrade_required: entitlement.status === 402,
    quota: "quota" in entitlement ? entitlement.quota : undefined,
  }, entitlement.status);

  const env = Deno.env.toObject();
  if (!env.GROQ_API_KEYS && !env.GROQ_API_KEY && !env.GEMINI_API_KEYS && !env.GEMINI_API_KEY && !env.GROQ_API_KEYS_EXTRA) {
    return json({ error: "ai_provider_not_configured", detail: "Add GROQ_API_KEYS and/or GEMINI_API_KEYS to Supabase Edge Function secrets." }, 503);
  }

  const temperature = Number.isFinite(Number(body.temperature))
    ? Math.min(1.5, Math.max(0, Number(body.temperature))) : 0.2;
  const maxTokens = Number.isFinite(Number(body.max_tokens))
    ? Math.min(8192, Math.max(128, Math.floor(Number(body.max_tokens)))) : 3000;

  try {
    const answer = await chatText(env, cleanMessages, {
      temperature,
      maxTokens,
      timeoutMs: Math.min(90000, Math.max(10000, Number(body.timeout_ms) || 60000)),
      manual: true,
    });
    return json({
      id: `ompath-${crypto.randomUUID()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "ompathstudy-auto",
      choices: [{ index: 0, message: { role: "assistant", content: answer }, finish_reason: "stop" }],
      usage: null,
      provider: "automatic",
      quota: entitlement.quota,
    });
  } catch (error) {
    console.error("Ompath AI provider failure:", error instanceof Error ? error.message : String(error));
    return json({ error: "ai_temporarily_unavailable", message: "All configured AI providers are temporarily unavailable. Please retry shortly." }, 503);
  }
});
