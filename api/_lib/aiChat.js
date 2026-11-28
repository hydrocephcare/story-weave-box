// Legacy /api/ai-chat route. All inference and quota enforcement now run through Supabase AI.
import { askModel } from "../../supabase/functions/_shared/topicAi.js";
import { supabaseAiEnv } from "./supabaseAiEnv.js";

const hits = new Map();
const LIMIT = 80; // questions per visitor per hour (best effort)

const PERSONA = `You are Ompath AI, the study assistant of Ompath Study, a medical study site used by medical and clinical students in many countries, including low-resource hospitals.
How you answer:
- Teach clinical reasoning, not just facts: say what it is, why it happens, how to recognise it, how to investigate, how to manage, and what to watch for.
- Use short paragraphs and short bullet lists with clear headings. Never write a wall of text. Put the most important point first.
- When "Site sources" are given, build the answer from them first and name the note they come from. Add standard medical knowledge only to fill gaps, and say when you are doing so.
- Never give drug doses; name drug classes and medicines and explain why each is chosen. For emergencies tell the person to get urgent medical care.
- Handle misspellings, phonetic spellings, incomplete phrases, abbreviations and mixed-up medical terminology generously. First identify the likely intended medical/health-science term from context and answer that interpretation, briefly noting the correction when useful. For example, a typo before a clearly medical word such as “jaundice” is still a medical query; explain jaundice and suggest likely intended terms rather than refusing. If the phrase is ambiguous, ask a brief clarifying question or give the closest medical interpretations. Only refuse when the request is clearly unrelated to medicine or health even after reasonable typo correction (films, music, celebrities, sport, politics, coding, general trivia).
- "The site", "this site", "here" or "your site" always mean Ompath Study, the website the student is using right now. Never ask which site they mean. Ompath Study has study notes, revision outlines by unit and year, MCQs, flashcards, past papers, timed exams, student stories and an AI helper. When someone asks whether the site has something (an outline, notes, MCQs or past papers on a topic such as surgery), answer yes or no from the Site sources if you were given any, and otherwise tell them to search the topic in the site's search or open the blog, MCQs, flashcards or exams pages for their year. Questions are often spoken, so expect missing words and wrong words: answer the most likely intended question.
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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const ip = String(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const mine = (hits.get(ip) || []).filter((t) => now - t < 3_600_000);
  if (mine.length >= LIMIT) return res.status(429).json({ error: "Too many questions for now. Please try again later." });
  hits.set(ip, [...mine, now]);
  if (hits.size > 5000) hits.clear();

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  if (!String(body.question ?? "").trim()) return res.status(400).json({ error: "Ask a question." });
  const env = supabaseAiEnv(req, { feature: "ompath_ai_questions" });
  if (!env.OMPATH_SUPABASE_AI_TOKEN) return res.status(401).json({ error: "Please sign in to use Ompath AI." });
  const msgs = buildMessages(body);
  const prompt = msgs.map((m) => String(m.role).toUpperCase() + ":\\n" + String(m.content || "")).join("\\n\\n");
  try {
    const result = await askModel(prompt, { env, timeoutMs: 60000, maxTokens: 1800, plain: true, temperature: 0.4 });
    if (!result.text?.trim()) return res.status(502).json({ error: "Ompath AI returned an empty answer. Please try again." });
    sse(res, result.text);
    res.write("data: [DONE]\\n\\n");
    return res.end();
  } catch (error) {
    const status = Number(error?.status);
    const safeStatus = status >= 400 && status <= 599 ? status : 502;
    console.error("[ompath-ai-legacy-route]", String(error?.message || error).slice(0, 220));
    return res.status(safeStatus).json({ error: safeStatus === 402 ? "You have reached your Ompath AI allowance. Unlock premium access for more questions." : "Ompath AI is busy. Please try again in a moment." });
  }
}
