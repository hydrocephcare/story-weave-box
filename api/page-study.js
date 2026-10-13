// POST /api/page-study { mode: "cards" | "quiz", title, text }: flashcards or a short quiz made from the page the reader is on.
// Groq first, Gemini as the backup (keys take turns), the same as the rest of the site's AI.
import { askModel } from "../supabase/functions/_shared/topicAi.js";

const hits = new Map();
const LIMIT = 40; // per visitor per hour (best effort)

const RULES = `Use only what the page says plus standard textbook medicine. No drug doses, no brand names. Plain words for a medical student.`;
const PROMPTS = {
  cards: (title, text) => `Make 8 flashcards from this study page: "${title}".
${RULES}
Each card tests one fact or one piece of reasoning. The question is short; the answer is one or two short sentences (under 35 words).
Return ONLY JSON: {"cards":[{"q":"...","a":"..."}]}

PAGE:
"""
${text}
"""`,
  quiz: (title, text) => `Write 5 multiple-choice questions from this study page: "${title}".
${RULES}
Four options each (A to D), exactly one correct, all options of similar length, no "all of the above". Spread the correct answer across different positions.
Return ONLY JSON: {"questions":[{"q":"...","options":["...","...","...","..."],"answer":0,"why":"one short sentence"}]}  where "answer" is the index 0 to 3 of the correct option.

PAGE:
"""
${text}
"""`,
};

async function ask(prompt, env) {
  if (env.GROQ_API_KEYS.trim()) { try { return await askModel(prompt, { env: { GROQ_API_KEYS: env.GROQ_API_KEYS }, timeoutMs: 35000, maxTokens: 1800 }); } catch { /* try Gemini */ } }
  return askModel(prompt, { env, timeoutMs: 35000, maxTokens: 1800 });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const env = { GROQ_API_KEYS: process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "", GEMINI_API_KEYS: process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "" };
  if (!env.GROQ_API_KEYS.trim() && !env.GEMINI_API_KEYS.trim()) return res.status(503).json({ error: "not configured" });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const mine = (hits.get(ip) || []).filter((t) => now - t < 3_600_000);
  if (mine.length >= LIMIT) return res.status(429).json({ error: "You have made a lot of these this hour. Try again a little later." });
  hits.set(ip, [...mine, now]); if (hits.size > 5000) hits.clear();

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const mode = body.mode === "quiz" ? "quiz" : "cards";
  const title = String(body.title ?? "").slice(0, 140);
  const text = String(body.text ?? "").replace(/\s+/g, " ").trim().slice(0, 5500);
  if (text.length < 200) return res.status(400).json({ error: "There is not enough text on this page yet." });
  try {
    const { text: out } = await ask(PROMPTS[mode](title, text), env);
    const j = JSON.parse(out.match(/\{[\s\S]*\}/)[0]);
    if (mode === "cards") {
      const cards = (Array.isArray(j.cards) ? j.cards : []).map((c) => ({ q: String(c?.q ?? "").trim().slice(0, 220), a: String(c?.a ?? "").trim().slice(0, 320) })).filter((c) => c.q.length > 8 && c.a.length > 4).slice(0, 10);
      if (cards.length < 3) throw new Error("few");
      return res.status(200).json({ cards });
    }
    const questions = (Array.isArray(j.questions) ? j.questions : []).map((x) => ({ q: String(x?.q ?? "").trim().slice(0, 300), options: (Array.isArray(x?.options) ? x.options : []).map((o) => String(o).trim().slice(0, 200)), answer: Number(x?.answer), why: String(x?.why ?? "").trim().slice(0, 300) }))
      .filter((x) => x.q.length > 10 && x.options.length === 4 && x.options.every(Boolean) && Number.isInteger(x.answer) && x.answer >= 0 && x.answer <= 3).slice(0, 6);
    if (questions.length < 3) throw new Error("few");
    return res.status(200).json({ questions });
  } catch {
    return res.status(502).json({ error: "Ompath AI could not make these just now. Please try again in a moment." });
  }
}
