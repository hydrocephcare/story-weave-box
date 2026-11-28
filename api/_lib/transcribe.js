// Speech-to-text requests are proxied to Supabase, which calls Groq Whisper. The hint helps preserve medical terminology.
const hits = new Map();
const LIMIT = 240;   // clips per visitor per hour (best effort)

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const ip = String(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const mine = (hits.get(ip) || []).filter((t) => now - t < 3_600_000);
  if (mine.length >= LIMIT) return res.status(429).json({ error: "Too many voice clips this hour. Try again a little later." });
  hits.set(ip, [...mine, now]); if (hits.size > 5000) hits.clear();

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const b64 = String(body.audio ?? "");
  if (b64.length < 400) return res.status(400).json({ error: "No sound was received." });
  if (b64.length > 3_800_000) return res.status(413).json({ error: "That clip is too long." });
  const mime = String(body.mime || "audio/webm").slice(0, 40);
  const hint = String(body.hint ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
  try {
    const response = await fetch("https://rcntjfzivtnijnkliouc.supabase.co/functions/v1/ompath-ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: "sb_publishable_HdlAHkp2wXjRCYqWLnPckw_dOUcjEVP",
        "x-client-ip": ip,
      },
      body: JSON.stringify({ task: "public_transcribe", audio: b64, mime, hint }),
      signal: AbortSignal.timeout(35_000),
    });
    const data = await response.json().catch(() => ({}));
    return res.status(response.status).json(data);
  } catch (error) {
    console.error("[transcribe] Supabase AI request failed", String(error).slice(0, 160));
    return res.status(502).json({ error: "The voice service is temporarily unavailable. Try again." });
  }
}
