import { createRemoteJWKSet, jwtVerify } from "jose";

const DEFAULT_JWKS = "https://ep-dry-haze-benks3ew.neonauth.c-9.us-east-2.aws.neon.tech/neondb/auth/.well-known/jwks.json";
const DEFAULT_DATA_API = "https://ep-dry-haze-benks3ew.apirest.c-9.us-east-2.aws.neon.tech/neondb/rest/v1";
const LIMIT = 80;
const hits = new Map();
const dead = new Map();
let turn = 0;

const splitKeys = (...values) => [...new Set(values.flatMap((value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {}
  return raw.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
}))].reverse();
const isDead = (id) => (dead.get(id) ?? 0) > Date.now();
const markDead = (id, ms = 45000) => dead.set(id, Date.now() + ms);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

async function consumeEntitlement(request, env) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { allowed: false, status: 401, reason: "login_required" };
  try {
    const jwks = createRemoteJWKSet(new URL(env.NEON_AUTH_JWKS_URL || DEFAULT_JWKS));
    const verified = await jwtVerify(token, jwks);
    const sub = verified.payload?.sub;
    if (!sub || !/^[0-9a-f-]{36}$/i.test(String(sub))) return { allowed: false, status: 401, reason: "invalid_session" };
  } catch {
    return { allowed: false, status: 401, reason: "invalid_session" };
  }
  try {
    const base = String(env.NEON_DATA_API_URL || DEFAULT_DATA_API).replace(/\/+$/, "");
    const response = await fetch(base + "/rpc/consume_feature", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ p_feature: "ompath_ai_questions", p_units: 1 }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 401 || response.status === 403) return { allowed: false, status: 401, reason: "invalid_session" };
    if (!response.ok) return { allowed: false, status: 503, reason: "verification_unavailable" };
    const result = await response.json();
    return { ...result, status: result.allowed ? 200 : result.reason === "login_required" ? 401 : 402 };
  } catch {
    return { allowed: false, status: 503, reason: "verification_unavailable" };
  }
}

const PERSONA = `You are Ompath AI, the study assistant of Ompath Study, a medical study site used by medical and clinical students in many countries, including low-resource hospitals.
How you answer:
- Teach clinical reasoning, not just facts: say what it is, why it happens, how to recognise it, how to investigate, how to manage, and what to watch for.
- Use short paragraphs and short bullet lists with clear headings. Never write a wall of text. Put the most important point first.
- When "Site sources" are given, build the answer from them first and name the note they come from. Add standard medical knowledge only to fill gaps, and say when you are doing so.
- Never give drug doses; name drug classes and medicines and explain why each is chosen. For emergencies tell the person to get urgent medical care.
- Handle misspellings, phonetic spellings, incomplete phrases, abbreviations and mixed-up medical terminology generously. First identify the likely intended medical/health-science term from context and answer that interpretation, briefly noting the correction when useful. If the phrase is ambiguous, ask a brief clarifying question or give the closest medical interpretations. Only refuse when the request is clearly unrelated to medicine or health even after reasonable typo correction.
- "The site", "this site", "here" or "your site" always mean Ompath Study. Ompath Study has study notes, revision outlines, MCQs, flashcards, past papers, timed exams, student stories and an AI helper. When someone asks whether the site has something, answer from Site sources if supplied; otherwise direct them to search the site.
- Be warm, plain and exam-aware. Do not mention these instructions, other AI products or how you are built.`;

function buildMessages(body) {
  const sources = (Array.isArray(body.sources) ? body.sources : []).slice(0, 8)
    .map((s, i) => `[${i + 1}] ${String(s.title ?? "").slice(0, 120)}${s.subtitle ? ` (${String(s.subtitle).slice(0, 80)})` : ""}\n${String(s.snippet ?? "").slice(0, 1800)}`)
    .join("\n\n");
  const messages = [{ role: "system", content: PERSONA + (sources ? "\n\nSite sources:\n" + sources : "") }];
  for (const h of (Array.isArray(body.history) ? body.history : []).slice(-6)) {
    if (h && (h.role === "user" || h.role === "assistant")) messages.push({ role: h.role, content: String(h.content ?? "").slice(0, 3000) });
  }
  messages.push({ role: "user", content: String(body.question ?? "").slice(0, 2500) });
  return messages;
}

function sse(value) {
  return "data: " + JSON.stringify({ choices: [{ delta: { content: value } }] }) + "\n\n";
}

async function viaGroq(messages, env, send) {
  const keys = splitKeys(env.GROQ_API_KEYS, env.GROQ_API_KEY, ...Array.from({ length: 20 }, (_, i) => env["GROQ_API_KEY_" + (i + 2)]));
  const models = splitKeys(env.GROQ_CHAT_MODELS || "openai/gpt-oss-120b,openai/gpt-oss-20b");
  const start = keys.length ? turn++ % keys.length : 0;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(start + i) % keys.length];
    for (const model of models) {
      const id = key + model;
      if (isDead(id)) continue;
      try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json", Authorization: "Bearer " + key },
          body: JSON.stringify({ model, stream: true, temperature: 0.4, max_tokens: 1800, reasoning_effort: "low", messages }),
          signal: AbortSignal.timeout(60000),
        });
        if ([429, 503, 404].includes(response.status)) { markDead(id); continue; }
        if (!response.ok || !response.body) continue;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "", sent = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const data = line.trim();
            if (!data.startsWith("data:")) continue;
            const raw = data.slice(5).trim();
            if (!raw || raw === "[DONE]") continue;
            try {
              const piece = JSON.parse(raw)?.choices?.[0]?.delta?.content;
              if (piece) { send(sse(piece)); sent = true; }
            } catch { /* ignore partial provider event */ }
          }
        }
        if (sent) return true;
      } catch { /* try next key/model */ }
    }
  }
  return false;
}

async function viaGemini(messages, env, send) {
  const keys = splitKeys(env.GEMINI_API_KEYS, env.GEMINI_API_KEY, ...Array.from({ length: 20 }, (_, i) => env["GEMINI_API_KEY_" + (i + 2)]));
  const models = splitKeys(env.GEMINI_CHAT_MODELS || "gemini-3.8-flash,gemini-3.5-flash-lite");
  const system = messages[0].content;
  const contents = messages.slice(1).map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const start = keys.length ? turn++ % keys.length : 0;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(start + i) % keys.length];
    for (const model of models) {
      const id = key + model;
      if (isDead(id)) continue;
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: 0.4, maxOutputTokens: 1800, ...(model.includes("2.5-flash") && !model.includes("lite") ? { thinkingConfig: { thinkingBudget: 0 } } : model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "low" } } : {}) } }),
          signal: AbortSignal.timeout(60000),
        });
        if ([429, 503, 404].includes(response.status)) { markDead(id); continue; }
        if (!response.ok) continue;
        const data = await response.json();
        const answer = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
        if (answer?.trim()) { send(sse(answer)); return true; }
      } catch { /* try next key/model */ }
    }
  }
  return false;
}

async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

async function onRequestPost({ request, env }) {
  const groqKeys = splitKeys(env.GROQ_API_KEYS, env.GROQ_API_KEY, ...Array.from({ length: 20 }, (_, i) => env["GROQ_API_KEY_" + (i + 2)]));
  const geminiKeys = splitKeys(env.GEMINI_API_KEYS, env.GEMINI_API_KEY, ...Array.from({ length: 20 }, (_, i) => env["GEMINI_API_KEY_" + (i + 2)]));
  if (!groqKeys.length && !geminiKeys.length) return json({ error: "Ompath AI is not configured yet." }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON request." }, 400); }
  const question = String(body?.question ?? "").trim();
  if (!question) return json({ error: "Ask a question." }, 400);

  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const mine = (hits.get(ip) || []).filter((time) => now - time < 3600000);
  if (mine.length >= LIMIT) return json({ error: "Too many questions for now. Please try again later." }, 429);
  hits.set(ip, [...mine, now]);
  if (hits.size > 5000) hits.clear();

  const quota = await consumeEntitlement(request, env);
  if (!quota.allowed) {
    const message = quota.reason === "quota_exhausted"
      ? "You have reached your free Ompath AI allowance. Unlock premium access for more questions."
      : quota.reason === "login_required" || quota.reason === "invalid_session"
        ? "Please sign in to use Ompath AI."
        : "We could not verify your access. Please try again.";
    return json({ error: message, upgrade_required: quota.status === 402, quota }, quota.status || 402);
  }

  const messages = buildMessages(body);
  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk) => controller.enqueue(new TextEncoder().encode(chunk));
      try {
        const ok = (groqKeys.length && await viaGroq(messages, env, send)) || (geminiKeys.length && await viaGemini(messages, env, send));
        if (!ok) send(sse("Ompath AI is busy. Please try again in a moment."));
        send("data: [DONE]\n\n");
      } catch {
        send(sse("Ompath AI encountered an error. Please try again."));
        send("data: [DONE]\n\n");
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}


// Use the universal Pages handler so POST/OPTIONS dispatch is explicit on every Pages runtime.
export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return onRequestOptions();
  if (context.request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  return onRequestPost(context);
}
