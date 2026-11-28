// Topic generation and deep-note generation are executed by the central Supabase AI gateway.
// Neon remains the source of truth; the gateway validates the session, charges entitlement once,
// performs generation and independent clinical review, and persists the result through Neon Data API.
const AI_URL = "https://rcntjfzivtnijnkliouc.supabase.co/functions/v1/ompath-ai";
const AI_PUBLISHABLE_KEY = "sb_publishable_HdlAHkp2wXjRCYqWLnPckw_dOUcjEVP";
const hits = new Map();
const LIMIT = 30;

function bearer(req) {
  return String(req.headers["x-neon-authorization"] || req.headers.authorization || "").replace(/^Bearer\\s+/i, "").trim();
}

async function invokeGateway(token, payload, timeoutMs = 90000) {
  if (!token) return { status: 401, data: { status: "login_required" } };
  try {
    const response = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: AI_PUBLISHABLE_KEY,
        "x-neon-authorization": token,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
  } catch (error) {
    console.error("[topic-write] Supabase AI gateway unavailable:", String(error?.message || error).slice(0, 180));
    return { status: 503, data: { status: "unavailable", reason: "ai_gateway_unavailable" } };
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const token = bearer(req);

  if (req.method === "GET" && new URL(req.url, "https://ompathstudy.com").searchParams.get("health") === "1") {
    const result = await invokeGateway(token, { task: "health" }, 30000);
    return res.status(result.status).json(result.data);
  }

  if (req.method !== "POST") return res.status(405).json({ status: "invalid" });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const name = String(body.name ?? "").trim();
  if (name.length < 3 || name.length > 100) return res.status(400).json({ status: "invalid" });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const mine = (hits.get(ip) || []).filter((t) => now - t < 3_600_000);
  if (mine.length >= LIMIT) return res.status(429).json({ status: "busy" });
  hits.set(ip, [...mine, now]);
  if (hits.size > 5000) hits.clear();

  const deep = body.mode === "deep";
  const payload = deep
    ? {
        task: "deep",
        name,
        category: String(body.category ?? "").slice(0, 60),
        base: body.base && typeof body.base === "object" ? body.base : {},
        past: (Array.isArray(body.past) ? body.past : []).map((x) => String(x).slice(0, 240)).slice(0, 12),
        slug: String(body.slug || "").slice(0, 120),
      }
    : {
        task: "topic",
        name,
        category: String(body.category ?? "").slice(0, 60),
        context: String(body.context ?? "").slice(0, 3000),
        choices: body.choices && typeof body.choices === "object" ? body.choices : undefined,
      };

  const result = await invokeGateway(token, payload, deep ? 90000 : 90000);
  return res.status(result.status).json(result.data);
}
