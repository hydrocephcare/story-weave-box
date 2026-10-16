// One place that talks to the AI providers for every admin tool. It tries several models on several keys, in an order that suits the job, retries when a provider
// says "slow down", drops options a model rejects, and tells the caller WHY it failed (rate limit, missing key, refused) instead of a bare "busy".
const list = (v) => [...new Set(String(v ?? "").split(/[\s,]+/).map((k) => k.trim()).filter(Boolean))];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let turn = 0;

const GROQ_MODELS = () => list(process.env.GROQ_CHAT_MODELS || "openai/gpt-oss-120b,qwen/qwen3.8-27b,openai/gpt-oss-20b");
const GEMINI_MODELS = () => list(process.env.GEMINI_CHAT_MODELS || "gemini-3.5-flash,gemini-flash-lite-latest,gemini-2.5-flash,gemini-2.5-flash-lite");

async function viaGroq(msgs, opt, why) {
  const keys = list(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY); if (!keys.length) { why.push("no Groq key"); return null; }
  const start = turn++ % keys.length;
  for (let i = 0; i < keys.length; i++) for (const model of GROQ_MODELS()) {
    for (const json of [true, false]) {
      try {
        const body = { model, messages: msgs, temperature: opt.temperature ?? 0.3, max_tokens: opt.maxTokens ?? 4000, ...(json ? { response_format: { type: "json_object" } } : {}) };
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${keys[(start + i) % keys.length]}` }, body: JSON.stringify(body) });
        if (r.ok) { const t = (await r.json())?.choices?.[0]?.message?.content; if (t) return t; why.push(`${model}: empty answer`); break; }
        const detail = (await r.text().catch(() => "")).slice(0, 140);
        why.push(`${model}: ${r.status}${r.status === 429 ? " rate limit" : r.status === 413 ? " too large" : ""}`);
        if (r.status === 400 && json) continue;  // this model did not accept JSON mode: try it plain
        void detail; break;
      } catch (e) { why.push(`${model}: ${String(e?.message ?? e).slice(0, 60)}`); break; }
    }
  }
  return null;
}

async function viaGemini(msgs, opt, why) {
  const keys = list(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY); if (!keys.length) { why.push("no Gemini key"); return null; }
  const system = msgs[0].content;
  const contents = msgs.slice(1).map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const start = turn++ % keys.length;
  for (let i = 0; i < keys.length; i++) for (const model of GEMINI_MODELS()) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": keys[(start + i) % keys.length] }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { responseMimeType: "application/json", temperature: opt.temperature ?? 0.3, maxOutputTokens: opt.maxTokens ?? 8000 } }) });
      if (r.ok) { const t = (await r.json())?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join(""); if (t?.trim()) return t; why.push(`${model}: empty answer`); continue; }
      why.push(`${model}: ${r.status}${r.status === 429 ? " rate limit" : ""}`);
    } catch (e) { why.push(`${model}: ${String(e?.message ?? e).slice(0, 60)}`); }
  }
  return null;
}

/**
 * Ask for JSON text. opt.prefer = "gemini" for long writing jobs (big context, generous limits) or "groq" for short planning (fast).
 * Returns { text } or { error } where error says what went wrong in plain words.
 */
export async function askJson(msgs, opt = {}) {
  const order = opt.prefer === "gemini" ? [viaGemini, viaGroq] : [viaGroq, viaGemini];
  const why = [];
  for (let round = 0; round < 2; round++) {
    for (const via of order) { const t = await via(msgs, opt, why); if (t) return { text: t }; }
    if (!why.some((w) => /rate limit|429/.test(w))) break;  // only a rate limit is worth waiting for
    await sleep(2500);
  }
  const configured = list(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY).length + list(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY).length;
  const limited = why.some((w) => /rate limit|429/.test(w));
  return { error: !configured ? "No AI key is set on the server." : limited ? "The AI providers are rate-limited right now (free quota used up for a moment). Wait about a minute and press send again." : `The AI providers refused the request (${[...new Set(why)].slice(0, 3).join("; ")}).`, why };
}
