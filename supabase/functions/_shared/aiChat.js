// Chat completions with the project's own keys: Gemini first, then Groq. Replaces the Lovable AI gateway. Plain JS (works in Deno and Node).
// Secrets: GEMINI_API_KEYS (comma separated) or GEMINI_API_KEY, GROQ_API_KEYS or GROQ_API_KEY.
const list = (v) => [...new Set(String(v ?? "").split(/[\s,]+/).map((k) => k.trim()).filter(Boolean))];
let turn = 0;

export async function chatText(env, messages, { temperature = 0.1, maxTokens = 8000, timeoutMs = 25000 } = {}) {
  const gem = list(env.GEMINI_API_KEYS || env.GEMINI_API_KEY), groq = list(env.GROQ_API_KEYS || env.GROQ_API_KEY);
  const tries = [];
  for (const key of gem) for (const model of ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"]) tries.push({ url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key, model });
  for (const key of groq) for (const model of ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"]) tries.push({ url: "https://api.groq.com/openai/v1/chat/completions", key, model });
  if (!tries.length) throw new Error("No AI key is set (GEMINI_API_KEYS or GROQ_API_KEYS).");
  const start = gem.length ? turn++ % gem.length : 0; // spread the load over the keys
  const ordered = [...tries.slice(start * 3), ...tries.slice(0, start * 3)];
  let last = "";
  for (const t of ordered) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(t.url, { method: "POST", headers: { Authorization: "Bearer " + t.key, "Content-Type": "application/json" }, body: JSON.stringify({ model: t.model, messages, temperature, max_tokens: maxTokens }), signal: controller.signal });
      if (r.ok) { const text = (await r.json())?.choices?.[0]?.message?.content; if (text) return text; last = t.model + ": empty"; continue; }
      last = t.model + ": " + r.status;
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
