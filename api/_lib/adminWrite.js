// POST /api/ai?task=write { mode: "note" | "mcq", ... }: admin only. Polishes pasted notes into a site note, or writes MCQs from a text. It only returns text;
// the browser shows it to the admin and saves it with the admin's own login after they press Publish.
import { isAdmin } from "./adminAgent.js";
import { askJson } from "./llm.js";
const list = (v) => [...new Set(String(v ?? "").split(/[\s,]+/).map((k) => k.trim()).filter(Boolean))];

const ENRICH = `
- The admin asked you to ADD MORE CONTENT. After the author's own material, add standard textbook knowledge that completes the topic (definition, causes, pathophysiology, features, investigations, management principles, complications), under a heading "## Added for completeness". Name drug classes, never doses or exact figures you are not certain of. The author's own facts stay first and unchanged.`;
const NOTE = (cats, enrich) => `You polish medical study notes for a free website used by medical students.
Rules:
- Keep every fact the author wrote. Do NOT add drug doses, numbers, statistics or claims that are not in the text. If something looks wrong, keep it and add the line "Check: <what looks off>" at the end of that section.
${enrich ? ENRICH : ""}
- Fix spelling and grammar. Expand an abbreviation on first use. Make it clear and exam-friendly.
- Structure with markdown: "## " headings (never a single "#"), short paragraphs, bullet lists, a table only when the text has comparable data, and a final "## Quick revision" with 5 to 8 bullets taken from the text.
- Choose the best category from this list, exactly as written, or "" if none fits: ${cats.slice(0, 90).join(" | ")}
Return ONLY JSON: {"title": "clear title, max 70 characters", "category": "...", "year": 1-6 or null, "meta_title": "max 60 characters", "meta_description": "120 to 155 characters, plain English, what the page teaches", "tags": ["5 to 8 lowercase tags"], "content": "the polished markdown"}`;

const MCQ = (n) => `You write single-best-answer multiple-choice questions for medical students, from the text you are given ONLY.
Write exactly ${n} questions. Each has 4 distinct options with one clearly correct answer, tests understanding (not trivia about wording), and a 1 to 2 sentence explanation that says why the answer is right. Do not use "all of the above" or "none of the above". Do not invent facts that are not in the text.
Return ONLY JSON: {"questions":[{"question":"...","options":["...","...","...","..."],"correct_answer":0,"explanation":"..."}]}  (correct_answer is the index 0-3 of the right option; vary it across questions).`;

const MCQ_IMPORT = `The text contains multiple-choice questions written by a lecturer or student (possibly messy: numbering, A/B/C/D or a/b/c, "Answer: B", a star or tick on the right option, or no answers at all).
Structure every question EXACTLY as written: keep the wording, keep the options in order, do not rewrite or add questions. If the answer is marked, use it. If it is NOT marked, work out the single best answer and add "(answer chosen by AI, please check)" to that question's explanation.
Return ONLY JSON: {"questions":[{"question":"...","options":["...","...","...","..."],"correct_answer":0,"explanation":"..."}]} (2 to 6 options are allowed; correct_answer is the 0-based index).`;

const CARDS = (n) => `You write flashcards for medical students from the text you are given ONLY.
Write up to ${n} cards. Each card tests ONE fact or one piece of reasoning: a short question on the front, and an answer of one or two short sentences (under 35 words) on the back. No yes/no questions, no "what is the name of the chapter", no invented facts.
Return ONLY JSON: {"cards":[{"question":"...","answer":"..."}]}`;

const ARTICLE = (cats) => `You write a new study note for a free website used by medical students, from the TOPIC the admin names.
Rules: be accurate and conservative. Use standard textbook knowledge only. Do NOT give drug doses or exact numbers you are not certain of; name drug classes instead. Where you are unsure, say "Check your textbook for the exact figure".
Structure with markdown: "## " headings (never a single "#"), short paragraphs, bullets, a table only when comparing things, and a final "## Quick revision" with 5 to 8 bullets. Aim for 500 to 900 words.
Choose the best category from this list, exactly as written, or "" if none fits: ${cats.slice(0, 90).join(" | ")}
Return ONLY JSON: {"title": "clear title, max 70 characters", "category": "...", "year": 1-6 or null, "meta_title": "max 60 characters", "meta_description": "120 to 155 characters", "tags": ["5 to 8 lowercase tags"], "content": "the markdown"}`;

const REVISE = `You revise a study note exactly as the admin asks (for example "shorter", "simpler words", "add a table of the causes", "remove the last section"). Keep all facts that remain; never add new medical facts that are not already in the note unless the admin explicitly asks and they are standard textbook knowledge (no doses).
Return ONLY JSON: {"content": "the full revised markdown", "meta_description": "120 to 155 characters, updated if the content changed"}`;

const parse = (raw) => { try { return JSON.parse(String(raw).replace(/^```(?:json)?|```$/gm, "").trim()); } catch { return null; } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !(await isAdmin(token))) return res.status(403).json({ error: "Administrators only." });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const mode = ["mcq", "mcq_import", "cards", "article", "revise"].includes(body.mode) ? body.mode : "note";
  const text = String(body.text ?? "").slice(0, 24000).trim();
  if (text.length < (mode === "article" ? 3 : 40)) return res.status(400).json({ error: mode === "article" ? "Tell me the topic." : "Give me at least a few lines of text." });
  const count = Math.max(1, Math.min(30, Number(body.count) || 10));
  const cats = (Array.isArray(body.categories) ? body.categories : []).map((c) => String(c)).filter(Boolean);
  const system = mode === "mcq_import" ? MCQ_IMPORT : mode === "mcq" ? MCQ(count) : mode === "cards" ? CARDS(count) : mode === "article" ? ARTICLE(cats) : mode === "revise" ? REVISE : NOTE(cats, Boolean(body.enrich));
  const user = mode === "revise" ? `INSTRUCTION: ${String(body.instruction ?? "").slice(0, 500)}\nNOTE:\n${text}` : `${body.title ? `Title hint: ${String(body.title).slice(0, 120)}\n` : ""}${body.category ? `Category hint: ${String(body.category).slice(0, 120)}\n` : ""}${mode === "article" ? "TOPIC" : "TEXT"}:\n${text}`;
  const msgs = [{ role: "system", content: system }, { role: "user", content: user }];
  // long writing jobs go to Gemini first (large context, generous free limits); short ones are fine on Groq
  const got = await askJson(msgs, { prefer: text.length > 3500 || mode === "article" || mode === "note" ? "gemini" : "groq", temperature: 0.3, maxTokens: mode === "mcq_import" ? 7000 : 6500 });
  if (got.error) return res.status(502).json({ error: got.error });
  const raw = got.text;
  const out = parse(raw);
  if (!out) return res.status(502).json({ error: "The writer gave an unreadable answer. Try again." });

  if (mode === "mcq_import") {
    const qs = (Array.isArray(out.questions) ? out.questions : []).map((q) => ({
      question: String(q?.question ?? "").trim(), options: (Array.isArray(q?.options) ? q.options : []).map((o) => String(o).trim()),
      correct_answer: Number(q?.correct_answer), explanation: String(q?.explanation ?? "").trim(),
    })).filter((q) => q.question.length > 5 && q.options.length >= 2 && q.options.length <= 6 && q.options.every(Boolean) && Number.isInteger(q.correct_answer) && q.correct_answer >= 0 && q.correct_answer < q.options.length);
    if (!qs.length) return res.status(502).json({ error: "I could not find multiple-choice questions in that text." });
    return res.status(200).json({ questions: qs.slice(0, 120), dropped: Math.max(0, (out.questions?.length || 0) - qs.length) });
  }
  if (mode === "mcq") {
    const qs = (Array.isArray(out.questions) ? out.questions : []).map((q) => ({
      question: String(q?.question ?? "").trim(), options: (Array.isArray(q?.options) ? q.options : []).map((o) => String(o).trim()),
      correct_answer: Number(q?.correct_answer), explanation: String(q?.explanation ?? "").trim(),
    })).filter((q) => q.question.length > 10 && q.options.length === 4 && new Set(q.options.map((o) => o.toLowerCase())).size === 4 && q.options.every(Boolean) && Number.isInteger(q.correct_answer) && q.correct_answer >= 0 && q.correct_answer <= 3);
    if (!qs.length) return res.status(502).json({ error: "The writer could not make usable questions from that text." });
    return res.status(200).json({ questions: qs.slice(0, count), dropped: Math.max(0, (out.questions?.length || 0) - qs.length) });
  }
  if (mode === "cards") {
    const cards = (Array.isArray(out.cards) ? out.cards : []).map((c) => ({ question: String(c?.question ?? "").trim(), answer: String(c?.answer ?? "").trim() })).filter((c) => c.question.length > 6 && c.answer.length > 2 && c.answer.length < 400);
    if (!cards.length) return res.status(502).json({ error: "The writer could not make usable flashcards from that text." });
    return res.status(200).json({ cards: cards.slice(0, count) });
  }
  const content = String(out.content ?? "").trim();
  if (content.length < 80) return res.status(502).json({ error: "The writer returned too little. Try again." });
  if (mode === "revise") return res.status(200).json({ content, meta_description: String(out.meta_description ?? "").trim().slice(0, 160) });
  const category = cats.includes(String(out.category)) ? String(out.category) : "";
  return res.status(200).json({
    title: String(out.title ?? "").trim().slice(0, 100), category, year: Number.isInteger(Number(out.year)) ? Number(out.year) : null,
    meta_title: String(out.meta_title ?? "").trim().slice(0, 60), meta_description: String(out.meta_description ?? "").trim().slice(0, 160),
    tags: (Array.isArray(out.tags) ? out.tags : []).map((t) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 8), content,
  });
}
