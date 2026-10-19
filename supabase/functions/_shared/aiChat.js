// Chat completions with the project's own keys: Gemini first, then Groq. Replaces the Lovable AI gateway. Plain JS (works in Deno and Node).
// Secrets: GEMINI_API_KEYS (comma separated) or GEMINI_API_KEY, GROQ_API_KEYS or GROQ_API_KEY.
const list = (v) => [...new Set(String(v ?? "").split(/[\s,]+/).map((k) => k.trim()).filter(Boolean))];
let turn = 0;
const cooldown = new Map();
// models that answer on the free plan today (gemini-2.0-flash and llama-3.3 were retired); each model has its own free quota, so a full one is skipped for the next
const GEMINI_MODELS = ["gemini-3.5-flash", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
const GROQ_MODELS = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"];

/**
 * The LAST key of each provider is kept for manual use (an admin or a reader pressing a button). Scheduled jobs (the default) never touch it, so a busy
 * schedule cannot use up the key a person is waiting on. A manual call tries that key first and then the others. With a single key there is nothing to hold back.
 */
const split = (keys, manual) => (keys.length < 2 ? keys : manual ? [keys[keys.length - 1], ...keys.slice(0, -1)] : keys.slice(0, -1));

export async function chatText(env, messages, { temperature = 0.1, maxTokens = 8000, timeoutMs = 25000, manual = false } = {}) {
  const gem = split(list(env.GEMINI_API_KEYS || env.GEMINI_API_KEY), manual), groq = split(list(env.GROQ_API_KEYS || env.GROQ_API_KEY), manual);
  // Gemini and Groq take turns at being first (so Groq's separate free allowance is used and Gemini's lasts longer); inside a provider the keys and models
  // rotate. A model that just said "quota used up" or "does not exist" is skipped for a while instead of being asked again on every call.
  const entries = (keys, url, models) => keys.flatMap((key, ki) => models.map((model) => ({ url, key, model, id: model + ":" + ki })));
  const gemAll = entries(gem, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", GEMINI_MODELS);
  const groqAll = entries(groq, "https://api.groq.com/openai/v1/chat/completions", GROQ_MODELS);
  if (!gemAll.length && !groqAll.length) throw new Error("No AI key is set (GEMINI_API_KEYS or GROQ_API_KEYS).");
  const rot = (arr, n, size) => (arr.length ? [...arr.slice((n * size) % arr.length), ...arr.slice(0, (n * size) % arr.length)] : arr);
  const n = turn++;
  const groqFirst = n % 2 === 1 || !gemAll.length;
  const A = rot(groqFirst ? groqAll : gemAll, Math.floor(n / 2), groqFirst ? GROQ_MODELS.length : GEMINI_MODELS.length);
  const B = rot(groqFirst ? gemAll : groqAll, Math.floor(n / 2), groqFirst ? GEMINI_MODELS.length : GROQ_MODELS.length);
  const all = [...A, ...B], now = Date.now();
  const ordered = [...all.filter((t) => (cooldown.get(t.id) || 0) <= now), ...all.filter((t) => (cooldown.get(t.id) || 0) > now)];
  let last = "";
  for (const t of ordered) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(t.url, { method: "POST", headers: { Authorization: "Bearer " + t.key, "Content-Type": "application/json" }, body: JSON.stringify({ model: t.model, messages, temperature, max_tokens: maxTokens }), signal: controller.signal });
      if (r.ok) { const text = (await r.json())?.choices?.[0]?.message?.content; if (text) return text; last = t.model + ": empty"; continue; }
      last = t.model + ": " + r.status;
      if (r.status === 429) cooldown.set(t.id, Date.now() + 60_000); else if (r.status === 404) cooldown.set(t.id, Date.now() + 3_600_000);
    } catch (e) { last = t.model + ": " + String(e?.message ?? e).slice(0, 50); } finally { clearTimeout(timer); }
  }
  throw new Error("All AI providers failed (" + last + ")");
}

/** One picture from Gemini's image model; returns a data URL. */
export async function geminiImage(env, prompt) {
  const keys = list(env.GEMINI_API_KEYS || env.GEMINI_API_KEY);
  if (!keys.length) throw new Error("GEMINI_API_KEYS is not set");
  let last = "";
  for (const key of keys) {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent", { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } }) });
    if (!r.ok) { last = String(r.status); continue; }
    const parts = (await r.json())?.candidates?.[0]?.content?.parts ?? [];
    const img = parts.find((p) => p.inlineData?.data);
    if (img) return "data:" + (img.inlineData.mimeType || "image/png") + ";base64," + img.inlineData.data;
    last = "no image";
  }
  throw new Error("Image generation failed (" + last + ")");
}
