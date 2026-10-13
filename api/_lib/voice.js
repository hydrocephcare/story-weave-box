// POST /api/voice (admin only): makes a copy of the admin's voice from a short recording, and turns page text into speech in that voice.
//   { action: "clone", audio: <base64>, mime, name }   -> { voiceId }
//   { action: "speak", voiceId, text }                  -> audio/mpeg bytes
// Uses ElevenLabs (the ELEVENLABS_API_KEY setting). Voice cloning is a paid feature there; nothing is spent until the admin presses a button.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://lkgfzjwhmfjvntzphbsh.supabase.co";
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrZ2Z6andobWZqdm50enBoYnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3Nzk5MjIsImV4cCI6MjA4NzM1NTkyMn0.a2QY6TxzKNM2AhuuoDkgdKifI3XhSGhYRlhpqZpvAwo";
const API = "https://api.elevenlabs.io/v1";

async function isAdmin(token) {
  if (!token) return false;
  try {
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
    const id = u.ok ? (await u.json())?.id : null;
    if (!id) return false;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/has_role`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ _user_id: id, _role: "admin" }) });
    return r.ok && (await r.json()) === true;
  } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ELEVENLABS_API_KEY || "";
  if (!key) return res.status(503).json({ error: "setup", message: "Add ELEVENLABS_API_KEY in Vercel and redeploy." });
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!(await isAdmin(token))) return res.status(403).json({ error: "Admin only." });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

  try {
    if (body.action === "clone") {
      const buf = Buffer.from(String(body.audio || ""), "base64");
      if (buf.length < 20_000) return res.status(400).json({ error: "The recording is too short. Read for at least 30 seconds." });
      const fd = new FormData();
      fd.append("name", String(body.name || "Abongo").slice(0, 40));
      fd.append("description", "The voice of the Ompath Study founder");
      fd.append("remove_background_noise", "true");
      fd.append("files", new Blob([buf], { type: String(body.mime || "audio/webm").split(";")[0] }), "sample.webm");
      const r = await fetch(`${API}/voices/add`, { method: "POST", headers: { "xi-api-key": key }, body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.voice_id) return res.status(502).json({ error: j?.detail?.message || j?.detail || `The voice service said ${r.status}. Voice cloning needs a paid ElevenLabs plan.` });
      return res.status(200).json({ voiceId: j.voice_id });
    }
    if (body.action === "speak") {
      const text = String(body.text || "").replace(/\s+/g, " ").trim().slice(0, 2800);
      const voiceId = String(body.voiceId || "").replace(/[^A-Za-z0-9]/g, "");
      if (text.length < 5 || !voiceId) return res.status(400).json({ error: "Nothing to read." });
      const r = await fetch(`${API}/text-to-speech/${voiceId}?output_format=mp3_44100_64`, { method: "POST", headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" }, body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.55, similarity_boost: 0.85, style: 0.15, use_speaker_boost: true } }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); return res.status(502).json({ error: j?.detail?.message || `The voice service said ${r.status}.` }); }
      const out = Buffer.from(await r.arrayBuffer());
      res.setHeader("Content-Type", "audio/mpeg"); res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(out);
    }
    return res.status(400).json({ error: "unknown action" });
  } catch (e) { return res.status(502).json({ error: String(e?.message || "failed").slice(0, 120) }); }
}
