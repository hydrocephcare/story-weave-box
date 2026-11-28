import { askGroqModel } from "../../supabase/functions/_shared/topicAi.js";
import { checkContent } from "../../supabase/functions/_shared/contentCheck.js";

const clean = (value, max = 1600) => String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
const noteText = (article, max = 10000) => clean(article?.content, max).replace(/!\[[^\]]*\]\([^)]*\)/g, "");

function jsonArray(raw) {
  const text = String(raw || "");
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(value) ? value : null;
  } catch { return null; }
}

function jsonObject(raw) {
  const text = String(raw || "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

function parseCards(raw) {
  const cards = jsonArray(raw);
  if (!cards) return [];
  const seen = new Set();
  return cards.map((card) => ({
    question: clean(card?.question, 240),
    answer: Array.isArray(card?.answer) ? card.answer.map((x) => "- " + clean(x, 500)).join("\n") : clean(card?.answer, 1400),
  })).filter((card) => {
    const key = card.question.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
    if (key.length < 10 || card.answer.length < 80 || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 22);
}

function parseEssays(raw) {
  const parsed = jsonObject(raw);
  if (!parsed) return null;
  const normalize = (items, marks, minPoints) => (Array.isArray(items) ? items : []).map((item) => ({
    question: clean(item?.question, 500),
    answer: clean(item?.answer ?? item?.model_answer, 5000),
    marks: Number(item?.marks) || marks,
  })).filter((item) => item.question.length >= 15
    && item.answer.length >= 80
    && item.answer.split("\n").filter((line) => /^\s*[-*•]\s+/.test(line)).length >= minPoints
  ).slice(0, marks === 5 ? 4 : 1);
  const saqs = normalize(parsed.saqs, 5, 4);
  const laqs = normalize(parsed.laqs, 20, 12);
  return saqs.length >= 4 && laqs.length >= 1 ? { saqs, laqs } : null;
}

async function reviewedGroqDraft({ title, kind, prompt, parse, env, fetchImpl, minimum, repairShape }) {
  const first = await askGroqModel(prompt, { env, fetchImpl, timeoutMs: 55000, maxTokens: 7500, plain: true });
  let output = parse(first.text);
  if (!output || (Array.isArray(output) ? output.length < minimum : !output)) {
    throw new Error(kind + " generation returned an incomplete or invalid structure.");
  }
  let review = await checkContent({ title, kind, text: JSON.stringify(output), env, fetchImpl, timeoutMs: 45000 });
  if (!review.validated || !review.model) {
    const repairPrompt = `You are correcting a medical education ${kind} set. Preserve all correct content, correct every clinical issue, and return only the complete JSON structure requested. Do not invent facts, statistics, criteria, references or doses.\nREVIEW FINDINGS:\n${(review.issues || []).map((x, i) => (i + 1) + ". " + x.problem + " Correction: " + x.fix).join("\n")}\nREQUIRED STRUCTURE:\n${repairShape}\nCURRENT DRAFT:\n${JSON.stringify(output)}`;
    const fixed = await askGroqModel(repairPrompt, { env, fetchImpl, timeoutMs: 55000, maxTokens: 7500, plain: true });
    output = parse(fixed.text);
    if (!output || (Array.isArray(output) ? output.length < minimum : !output)) {
      throw new Error(kind + " clinical repair returned an incomplete structure.");
    }
    review = await checkContent({ title, kind, text: JSON.stringify(output), env, fetchImpl, timeoutMs: 45000 });
  }
  if (!review.validated || !review.model) {
    throw new Error(kind + " did not pass independent Gemini clinical review.");
  }
  return { output, review };
}

export async function generateReviewedNoteFlashcards(article, env, fetchImpl = fetch) {
  const source = noteText(article, 10000);
  const count = Math.max(10, Math.min(22, Math.round(source.length / 450)));
  const prompt = `Write ${count} high-yield revision flashcards for medical students from this study note.
Each card covers one distinct angle supported by the note: definition, causes, pathophysiology, clinical features, classification, investigations, differentials, management/pharmacology, complications, ward-round points, prognosis or prevention.
Each answer is 35–60 words: a direct answer, then 3–4 short explanatory lines, and a final Related line. Do not repeat facts across cards. Never invent doses or criteria. If the note includes a useful image link, retain it.
Return ONLY JSON array: [{"question":"...","answer":"..."}].
TOPIC: ${article.title} | ${article.category}
SOURCE NOTE:
${source}`;
  const result = await reviewedGroqDraft({
    title: article.title,
    kind: "medical revision flashcards",
    prompt,
    parse: parseCards,
    env,
    fetchImpl,
    minimum: 8,
    repairShape: 'A JSON array of at least 8 distinct {"question":"...","answer":"..."} cards; every answer must be clinically accurate and self-contained.',
  });
  return { cards: result.output, review: result.review };
}

export async function generateReviewedNoteEssays(article, env, fetchImpl = fetch) {
  const source = noteText(article, 10000);
  const prompt = `Write exactly 4 short-answer questions (5 marks each) and 1 long-answer question (20 marks) for medical students from this study note.
Questions must be full exam instructions ("Discuss...", "List and explain...", "Outline...") and answerable from the note.
Model answers must be point-form. Each 5-mark answer must have 4–6 distinct points; the 20-mark answer must have 14–20 distinct points. Group related points under bold lead-ins. Do not repeat the same fact across questions. Never invent doses, statistics or diagnostic criteria.
Return ONLY JSON:
{"saqs":[{"question":"...","answer":"- **Causes**\\n- ...","marks":5}],"laqs":[{"question":"...","answer":"- **Definition**\\n- ...","marks":20}]}
TOPIC: ${article.title} | ${article.category}
SOURCE NOTE:
${source}`;
  const result = await reviewedGroqDraft({
    title: article.title,
    kind: "medical essay questions and model answers",
    prompt,
    parse: parseEssays,
    env,
    fetchImpl,
    minimum: 1,
    repairShape: 'An object with exactly four usable "saqs" (each with question, answer, marks: 5 and at least four answer bullets) and one usable "laqs" (marks: 20 and at least twelve answer bullets).',
  });
  return { ...result.output, review: result.review };
}
