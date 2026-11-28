const AI_URL = "https://rcntjfzivtnijnkliouc.supabase.co/functions/v1/ompath-ai";
const AI_PUBLISHABLE_KEY = "sb_publishable_HdlAHkp2wXjRCYqWLnPckw_dOUcjEVP";
const LIMIT = 80;
const hits = new Map();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
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

function buildPrompt(body) {
  const sources = (Array.isArray(body.sources) ? body.sources : []).slice(0, 8)
    .map((s, i) => `[${i + 1}] ${String(s.title ?? "").slice(0, 120)}${s.subtitle ? ` (${String(s.subtitle).slice(0, 80)})` : ""}\n${String(s.snippet ?? "").slice(0, 1800)}`)
    .join("\n\n");
  const messages = [PERSONA + (sources ? "\n\nSite sources:\n" + sources : "")];
  for (const h of (Array.isArray(body.history) ? body.history : []).slice(-6)) {
    if (h && (h.role === "user" || h.role === "assistant")) {
      messages.push(String(h.role).toUpperCase() + ": " + String(h.content ?? "").slice(0, 3000));
    }
  }
  messages.push("USER: " + String(body.question ?? "").slice(0, 2500));
  return messages.join("\n\n");
}

function sse(value) {
  return "data: " + JSON.stringify({ choices: [{ delta: { content: value } }] }) + "\n\n";
}

async function onRequestPost({ request }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON request." }, 400); }
  const question = String(body?.question ?? "").trim();
  if (!question) return json({ error: "Ask a question." }, 400);

  const token = (request.headers.get("x-neon-authorization") || request.headers.get("authorization") || "").replace(/^Bearer\\s+/i, "").trim();
  if (!token) return json({ error: "Please sign in to use Ompath AI." }, 401);

  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const mine = (hits.get(ip) || []).filter((time) => now - time < 3600000);
  if (mine.length >= LIMIT) return json({ error: "Too many questions for now. Please try again later." }, 429);
  hits.set(ip, [...mine, now]);
  if (hits.size > 5000) hits.clear();

  let upstream;
  try {
    upstream = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: AI_PUBLISHABLE_KEY,
        "x-neon-authorization": token,
      },
      body: JSON.stringify({
        task: "provider_call",
        provider: "auto",
        feature: "ompath_ai_questions",
        prompt: buildPrompt(body),
        plain: true,
        temperature: 0.3,
        maxTokens: 5000,
        timeoutMs: 55000,
      }),
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    return json({ error: "Ompath AI is temporarily unavailable. Please try again." }, 503);
  }

  const result = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const status = upstream.status === 401 ? 401 : upstream.status === 402 ? 402 : upstream.status === 429 ? 429 : 503;
    return json({
      error: status === 402
        ? "You have reached your free Ompath AI allowance. Unlock premium access for more questions."
        : status === 401
          ? "Please sign in again to use Ompath AI."
          : "Ompath AI is busy. Please try again in a moment.",
      upgrade_required: status === 402,
      quota: result.quota,
    }, status);
  }

  const answer = String(result.text ?? "").trim();
  if (!answer) return json({ error: "Ompath AI returned an empty response. Please try again." }, 502);

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(sse(answer)));
      controller.enqueue(new TextEncoder().encode("data: [DONE]\\n\\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" },
  });
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  if (context.request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  return onRequestPost(context);
}
