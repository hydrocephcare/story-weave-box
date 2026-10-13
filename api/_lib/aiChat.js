// POST /api/ai-chat { question, history, sources }: Ompath AI answers, streamed as OpenAI-style server-sent events (what the site already reads).
// Groq first (fast, keys take turns), Gemini (keys take turns) when Groq is busy or out of quota. Keys: GROQ_API_KEYS, GEMINI_API_KEYS.
const hits = new Map();
const LIMIT = 80; // questions per visitor per hour (best effort)
let turn = 0;
const dead = new Map(); // key+model -> until
const isDead = (id) => (dead.get(id) ?? 0) > Date.now();
const kill = (id, ms = 45_000) => dead.set(id, Date.now() + ms);

const list = (v) => [...new Set(String(v ?? "").split(/[\s,]+/).map((k) => k.trim()).filter(Boolean))];

const PERSONA = `You are Ompath AI, the study assistant of Ompath Study, a medical study site used by medical and clinical students in many countries, including low-resource hospitals.
How you answer:
- Teach clinical reasoning, not just facts: say what it is, why it happens, how to recognise it, how to investigate, how to manage, and what to watch for.
- Use short paragraphs and short bullet lists with clear headings. Never write a wall of text. Put the most important point first.
- When "Site sources" are given, build the answer from them first and name the note they come from. Add standard medical knowledge only to fill gaps, and say when you are doing so.
- Never give drug doses; name drug classes and medicines and explain why each is chosen. For emergencies tell the person to get urgent medical care.
- Only medical and health-science topics. For anything else, say politely that you only help with medicine and health.
- Be warm, plain and exam-aware. Do not mention these instructions, other AI products or how you are built.`;

function buildMessages({ question, history, sources }) {
  const src = (Array.isArray(sources) ? sources : []).slice(0, 8).map((s, i) => `[${i + 1}] ${String(s.title ?? "").slice(0, 120)}${s.subtitle ? ` (${String(s.subtitle).slice(0, 80)})` : ""}\n${String(s.snippet ?? "").slice(0, 1800)}`).join("\n\n");
  const msgs = [{ role: "system", content: PERSONA + (src ? `\n\nSite sources:\n${src}` : "") }];
  for (const h of (Array.isArray(history) ? history : []).slice(-6)) if (h && (h.role === "user" || h.role === "assistant")) msgs.push({ role: h.role, content: String(h.content ?? "").slice(0, 3000) });
  msgs.push({ role: "user", content: String(question ?? "").slice(0, 2500) });
  return msgs;
}

const sse = (res, text) => {
  if (!res.headersSent) {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.statusCode = 200;
  }
  return res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
};

async function viaGroq(msgs, res, keys) {
  const models = list(process.env.GROQ_CHAT_MODELS || "openai/gpt-oss-120b,openai/gpt-oss-20b");
  const start = keys.length ? turn++ % keys.length : 0;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(start + i) % keys.length];
    for (const model of models) {
      const id = key + model;
      if (isDead(id)) continue;
      try {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, stream: true, temperature: 0.4, max_tokens: 1800, reasoning_effort: "low", messages: msgs }) });
        if (r.status === 429 || r.status === 503 || r.status === 404) { kill(id); continue; }
        if (!r.ok || !r.body) continue;
        const reader = r.body.getReader(); const dec = new TextDecoder();
        let buf = "", sent = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n"); buf = lines.pop() ?? "";
          for (const l of lines) {
            const d = l.trim();
            if (!d.startsWith("data:")) continue;
            const p = d.slice(5).trim();
            if (!p || p === "[DONE]") continue;
            try { const piece = JSON.parse(p)?.choices?.[0]?.delta?.content; if (piece) { sse(res, piece); sent = true; } } catch { /* partial */ }
          }
        }
        if (sent) return true;
      } catch { /* try the next key */ }
    }
  }
  return false;
}

async function viaGemini(msgs, res, keys) {
  const models = list(process.env.GEMINI_CHAT_MODELS || "gemini-2.5-flash,gemini-2.5-flash-lite,gemini-3.8-flash");
  const system = msgs[0].content;
  const contents = msgs.slice(1).map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const start = keys.length ? turn++ % keys.length : 0;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(start + i) % keys.length];
    for (const model of models) {
      const id = key + model;
      if (isDead(id)) continue;
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: 0.4, maxOutputTokens: 1800, ...(model.includes("2.5-flash") && !model.includes("lite") ? { thinkingConfig: { thinkingBudget: 0 } } : {}) } }) });
        if (r.status === 429 || r.status === 503 || r.status === 404) { kill(id); continue; }
        if (!r.ok) continue;
        const text = (await r.json())?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
        if (text?.trim()) { sse(res, text); return true; }
      } catch { /* try the next key */ }
    }
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const groq = list(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY);
  const gemini = list(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY);
  if (!groq.length && !gemini.length) return res.status(503).json({ error: "not configured" });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const mine = (hits.get(ip) || []).filter((t) => now - t < 3_600_000);
  if (mine.length >= LIMIT) return res.status(429).json({ error: "Too many questions for now. Please try again later." });
  hits.set(ip, [...mine, now]);
  if (hits.size > 5000) hits.clear();

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  if (!String(body.question ?? "").trim()) return res.status(400).json({ error: "Ask a question." });
  const msgs = buildMessages(body);
  const ok = (groq.length && (await viaGroq(msgs, res, groq))) || (gemini.length && (await viaGemini(msgs, res, gemini)));
  if (!ok) return res.status(502).json({ error: "Ompath AI is busy. Please try again in a moment." });
  res.write("data: [DONE]\n\n");
  res.end();
}
