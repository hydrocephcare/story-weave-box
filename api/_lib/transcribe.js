// POST /api/ai?task=transcribe { audio: base64, mime, hint }: speech to text with Whisper on Groq, which understands medical words and accents far better than the
// browser's own recogniser. `hint` (the card's question and key words) is given to Whisper as a prompt, so "flumazenil" is heard as flumazenil.
const list = (v) => [...new Set(String(v ?? "").split(/[\s,]+/).map((k) => k.trim()).filter(Boolean))];
const hits = new Map();
const LIMIT = 240;   // clips per visitor per hour (best effort)

const EXT = (mime) => (/mp4|m4a|aac/i.test(mime) ? "m4a" : /ogg/i.test(mime) ? "ogg" : /wav/i.test(mime) ? "wav" : /mpeg|mp3/i.test(mime) ? "mp3" : "webm");

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  // the last key is the one kept for manual use; people waiting on their voice are exactly that, so it goes first
  const keys = list(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY).reverse();
  if (!keys.length) return res.status(503).json({ error: "not configured" });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
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
  const audio = Buffer.from(b64, "base64");

  let last = "";
  for (const key of keys) {
    for (const model of ["whisper-large-v3-turbo", "whisper-large-v3"]) {
      try {
        const form = new FormData();
        form.append("file", new Blob([audio], { type: mime }), `clip.${EXT(mime)}`);
        form.append("model", model);
        form.append("language", "en");
        form.append("temperature", "0");
        form.append("response_format", "json");
        if (hint) form.append("prompt", hint);
        const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(25000) });
        if (r.ok) {
          const text = String((await r.json())?.text ?? "").replace(/\s+/g, " ").trim();
          // Whisper sometimes answers silence with a stock phrase; those are not speech
          if (/^(thank you[.!]?|thanks for watching[.!]?|you)$/i.test(text)) return res.status(200).json({ text: "" });
          return res.status(200).json({ text });
        }
        last = `${model}: ${r.status}`;
        if (r.status === 400) return res.status(400).json({ error: "That recording could not be read." });
      } catch (e) { last = `${model}: ${String(e?.message ?? e).slice(0, 60)}`; }
    }
  }
  return res.status(502).json({ error: `The voice service is busy (${last}). Try again.` });
}
