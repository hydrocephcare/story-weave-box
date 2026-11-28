// Compatibility route for older story clients. Inference runs in Supabase; this handler only forwards the request.
const hits = new Map();
const LIMIT = 20;
export default async function assist(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const ip = String(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const mine = (hits.get(ip) || []).filter((t) => now - t < 3_600_000);
  if (mine.length >= LIMIT) return res.status(429).json({ error: "You have used the helper a lot this hour. Please try again a little later." });
  hits.set(ip, [...mine, now]); if (hits.size > 5000) hits.clear();
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  try {
    const response = await fetch("https://rcntjfzivtnijnkliouc.supabase.co/functions/v1/ompath-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: "sb_publishable_HdlAHkp2wXjRCYqWLnPckw_dOUcjEVP" },
      body: JSON.stringify({ task: "public_assist", ...body }),
      signal: AbortSignal.timeout(55000),
    });
    const data = await response.json().catch(() => ({}));
    return res.status(response.status).json(data);
  } catch (error) {
    console.error("[story-assist] Supabase AI request failed", String(error).slice(0, 160));
    return res.status(503).json({ error: "The writing helper is temporarily unavailable." });
  }
}
