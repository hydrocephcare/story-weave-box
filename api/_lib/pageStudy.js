// POST /api/page-study { mode: "cards" | "quiz", title, text }: flashcards or a short quiz made from the page the reader is on.
// Groq first, Gemini as the backup (keys take turns), the same as the rest of the site's AI.
import { askModel } from "../../supabase/functions/_shared/topicAi.js";

const hits = new Map();
const LIMIT = 40; // per visitor per hour (best effort)

const RULES = `Use only what the page says plus standard textbook medicine. No drug doses, no brand names. Plain words for a medical student.`;
const PROMPTS = {
  cards: (title, text) => `Create 14 high-yield medical flashcards from this study page: "${title}".
${RULES}
Each card summarises ONE angle of a subject, so the answer is never one sentence, but the WHOLE answer must fit on a phone card with no scrolling: 35 to 60 words.
Answer format: line 1 is the direct answer in bold (**like this**); then 3 to 4 short lines starting with "- ", labelled where useful (Pathology:, Physiology:, Pharmacology:, Bedside:, Ward round:) that EXPLAIN why and how; the last line starts "Related: " and names 1 to 3 connected facts.
Angles, in teaching order (use only those the page supports; for several conditions or drugs repeat them for each): definition and why it matters; risk factors and causes; pathophysiology and pathology (cause, mechanism, effect); clinical features and red flags; classification or severity; investigations and what they show; differentials; management and pharmacology (class and why, no doses); complications; ward-round points (examine, monitor, position, review, escalate, discharge advice); prognosis and prevention. For a drug: class, mechanism, uses, adverse effects, cautions, monitoring.
NO REPETITION: each fact appears in exactly one card; a later card may only mention an earlier idea in its Related line. Questions must name the subject and ask for one angle. Stay grounded in the page plus standard textbook medicine; never invent specifics.
Return ONLY JSON: {"cards":[{"q":"...","a":"..."}]}

PAGE:
"""
${text}
"""`,
  essays: (title, text) => `Write 5 essay questions an examiner could set from this study page: "${title}", each with a model answer.
${RULES}
Mix the command words (describe, explain, discuss, outline, compare). Give each a mark value (5, 8 or 10), 4 to 6 marking points, and a model answer of 90 to 150 words in clear paragraphs.
Return ONLY JSON: {"essays":[{"q":"...","marks":10,"points":["..."],"answer":"..."}]}

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

async function ask(prompt, env, maxTokens = 1800) {
  if (env.GROQ_API_KEYS.trim()) { try { return await askModel(prompt, { env: { GROQ_API_KEYS: env.GROQ_API_KEYS }, timeoutMs: 35000, maxTokens }); } catch { /* try Gemini */ } }
  return askModel(prompt, { env, timeoutMs: 35000, maxTokens });
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
  if (body.mode === "spell") {
    // a misspelt medical term: the correctly spelt terms the student most likely meant
    const typed = String(body.query ?? "").replace(/[^A-Za-z0-9 '\-,./]/g, " ").trim().slice(0, 80);
    if (typed.length < 3) return res.status(200).json({ suggestions: [] });
    try {
      const { text: out } = await ask(`A medical student typed this into a search box and may have misspelt it: "${typed}". Give up to 5 correctly spelt medical terms (diseases, drugs, anatomy, procedures, signs) it most likely means, most likely first. If it is not medical or you cannot tell, return an empty list. Return ONLY JSON: {"suggestions":["..."]}`, env, 300);
      const j = JSON.parse(out.match(/\{[\s\S]*\}/)[0]);
      const list = (Array.isArray(j.suggestions) ? j.suggestions : []).map((x) => String(x).trim()).filter((x) => /^[A-Za-z][A-Za-z0-9 '\-,./()]{2,60}$/.test(x)).slice(0, 5);
      return res.status(200).json({ suggestions: list });
    } catch { return res.status(200).json({ suggestions: [] }); }
  }
  const mode = body.mode === "quiz" ? "quiz" : body.mode === "essays" ? "essays" : "cards";
  const title = String(body.title ?? "").slice(0, 140);
  const text = String(body.text ?? "").replace(/\s+/g, " ").trim().slice(0, 5500);
  if (text.length < 200) return res.status(400).json({ error: "There is not enough text on this page yet." });
  try {
    const { text: out } = await ask(PROMPTS[mode](title, text), env, mode === "essays" ? 3400 : mode === "cards" ? 3600 : 1800);
    const j = JSON.parse(out.match(/\{[\s\S]*\}/)[0]);
    if (mode === "cards") {
      const cards = (Array.isArray(j.cards) ? j.cards : []).map((c) => ({ q: String(c?.q ?? "").trim().slice(0, 220), a: String(c?.a ?? "").trim().slice(0, 900) })).filter((c) => c.q.length > 8 && c.a.length > 4).slice(0, 16);
      if (cards.length < 3) throw new Error("few");
      return res.status(200).json({ cards });
    }
    if (mode === "essays") {
      const essays = (Array.isArray(j.essays) ? j.essays : []).map((e) => ({ q: String(e?.q ?? "").trim().slice(0, 300), marks: [5, 8, 10, 12, 15, 20].includes(Number(e?.marks)) ? Number(e.marks) : 10, points: (Array.isArray(e?.points) ? e.points : []).map((p) => String(p).trim().slice(0, 200)).filter(Boolean).slice(0, 7), answer: String(e?.answer ?? "").trim().slice(0, 1300) }))
        .filter((e) => e.q.length > 12 && e.answer.length > 80).slice(0, 5);
      if (essays.length < 3) throw new Error("few");
      return res.status(200).json({ essays });
    }
    const questions = (Array.isArray(j.questions) ? j.questions : []).map((x) => ({ q: String(x?.q ?? "").trim().slice(0, 300), options: (Array.isArray(x?.options) ? x.options : []).map((o) => String(o).trim().slice(0, 200)), answer: Number(x?.answer), why: String(x?.why ?? "").trim().slice(0, 300) }))
      .filter((x) => x.q.length > 10 && x.options.length === 4 && x.options.every(Boolean) && Number.isInteger(x.answer) && x.answer >= 0 && x.answer <= 3).slice(0, 6);
    if (questions.length < 3) throw new Error("few");
    return res.status(200).json({ questions });
  } catch {
    return res.status(502).json({ error: "Ompath AI could not make these just now. Please try again in a moment." });
  }
}
