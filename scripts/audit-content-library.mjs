import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

async function all(table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).eq("published", true).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

const articles = await all("articles", "id,title,slug,category,content,original_notes,content_kind,exam_type,is_raw,deleted_at");
const mcqs = await all("mcq_sets", "id,title,slug,category,questions");
const flashcards = await all("flashcard_sets", "id,title,slug,category,cards");
const essays = await all("essays", "id,title,slug,category,short_answer_questions,long_answer_questions");
const stories = await all("stories", "id,title,slug,category,content");

const findings = [];
const add = (type, row, code, detail) => findings.push({ type, id: row.id, slug: row.slug, title: row.title, code, detail });
const hasRecoverableEmbeddedExplanation = (q) => {
  const question = String(q?.question || "");
  const options = Array.isArray(q?.options) ? q.options.map((v) => String(v || "").replace(/^\s*[A-F][.)]\s*/i, "").trim()) : [];
  const correct = Number(q?.correct_answer);
  const colon = question.lastIndexOf(":");
  if (colon < 10 || !Number.isInteger(correct) || !options[correct]) return false;
  const stem = question.slice(0, colon).trim(), suffix = question.slice(colon + 1).trim().toLowerCase();
  if (stem.length < 10 || suffix.length < 24) return false;
  const words = options[correct].toLowerCase().match(/[a-z][a-z-]{3,}/g) || [];
  return words.some((word) => suffix.includes(word));
};

for (const row of articles.filter((x) => !x.is_raw && !x.deleted_at)) {
  const text = String(row.content || "");
  const images = (text.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;
  const questionHeads = (text.match(/^#{1,6}\s+(?:Q(?:uestion)?\s*)?\d+/gim) || []).length;
  const explicitQuestionHeads = (text.match(/^#{1,6}\s+(?:Q(?:uestion)?\s*)\d+/gim) || []).length;
  const answerHeads = (text.match(/^(?:[-*]\s*)?(?:#{1,6}\s*)?(?:\*\*)?(?:Answer|Model answer|Correct answer)(?:\s+\d+)?\s*:/gim) || []).length;
  const choices = (text.match(/^\s*(?:[-*]\s*)?(?:\*\*)?[A-F][.)]\s+/gim) || []).length;
  const source = String(row.original_notes || "");
  const sourceImages = (source.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;
  if (text.trim().length < 500 && source.trim().length < 500 && images === 0 && sourceImages === 0) add("article", row, "thin-content", `${text.trim().length} content characters; no usable source`);
  if (text.trim().length < 500 && (source.trim().length >= 500 || sourceImages > 0)) add("article", row, "source-scan-fallback", `${sourceImages} source images; ${source.trim().length} source characters`);
  if (/^(?:notice to all students\b|students handbook\b|executive order no\b)/i.test(row.title || "")) add("article", row, "non-study-import", "quarantine from public study listings");
  if (/Ã.|Â.|â€|ï¿½/.test(text)) add("article", row, "encoding", "possible mojibake");
  // "Examination" is common in clinical-skills note titles (for example,
  // cardiovascular examination) and must not be treated as an exam marker.
  const explicitQuestionResource = /\b(?:mcqs?|question bank|past paper|exam|cat)\b/i.test(
    `${row.title || ""} ${row.content_kind || ""} ${row.exam_type || ""}`,
  );
  const explicitQuestionSection = /^#{1,6}\s+(?:multiple[- ]choice questions?|questions?|exam paper)\b/im.test(text);
  const shouldRequireAnswers = explicitQuestionHeads >= 2 || explicitQuestionSection || explicitQuestionResource;
  const hasInlineAnswerFramework = /\b(?:marking scheme|exam answers|questions and answers|model answers?)\b/i.test(text);
  // Long essay/Q&A resources commonly place the response directly below each
  // question rather than under a literal "Answer:" heading.
  const hasSubstantialInlineResponses = questionHeads >= 2 && text.length / questionHeads >= 1000;
  if (shouldRequireAnswers && questionHeads >= 2 && choices >= 8 && answerHeads === 0 && !hasInlineAnswerFramework && !hasSubstantialInlineResponses) {
    const hasExplicitUnverifiedKey = /unverified handwritten source markings|do not use .* as a grading key/i.test(text);
    const sourceIssuedNoKey = /source (?:contains|had) no (?:official )?answer key|answers have not been invented/i.test(text);
    const code = hasExplicitUnverifiedKey ? "unverified-source-key" : sourceIssuedNoKey ? "question-paper-no-key" : "answers-unverified";
    const detail = hasExplicitUnverifiedKey
      ? `${questionHeads} questions; source markings explicitly quarantined from grading`
      : sourceIssuedNoKey
        ? `${questionHeads} questions; preserved source issued without an answer key`
        : `${questionHeads} questions, no explicit Answer headings`;
    add("article", row, code, detail);
  }
  const explicitlyTextOnlyPractical = /image-dependent questions have been excluded/i.test(text)
    || (/\bnotes\b/i.test(String(row.content_kind || "")) && /revision q&a|point-form q&a/i.test(text));
  if (/aponeurosis|spot/i.test(`${row.title} ${row.content_kind}`) && images + sourceImages === 0 && !explicitlyTextOnlyPractical) {
    add("article", row, "spot-without-image", "visual bank has no source image");
  }
}

for (const row of mcqs) {
  const questions = Array.isArray(row.questions) ? row.questions : [];
  if (!questions.length) add("mcq", row, "empty", "no questions");
  if (questions.length < 10) add("mcq", row, "short-set", `${questions.length} questions`);
  questions.forEach((q, index) => {
    const questionText = String(q?.question || "");
    const options = Array.isArray(q?.options) ? q.options.map((v) => String(v || "").replace(/^\s*[A-F][.)]\s*/i, "").trim()).filter(Boolean) : [];
    if (/[:?]\s*A\)\s*\S/i.test(questionText)) add("mcq", row, "shifted-first-choice", `question ${index + 1}`);
    if (options.length < 2 || !Number.isInteger(Number(q?.correct_answer)) || Number(q.correct_answer) < 0 || Number(q.correct_answer) >= options.length) add("mcq", row, "invalid-question", `question ${index + 1}`);
    if (new Set(options.map((v) => v.toLowerCase())).size < options.length) add("mcq", row, "duplicate-choice", `question ${index + 1}`);
    if (!String(q?.explanation || "").trim()) {
      add("mcq", row, hasRecoverableEmbeddedExplanation(q) ? "embedded-explanation-recovered" : "missing-explanation", `question ${index + 1}`);
    }
  });
}

for (const row of flashcards) {
  const cards = Array.isArray(row.cards) ? row.cards : [];
  if (!cards.length) add("flashcard", row, "empty", "no cards");
  cards.forEach((card, index) => {
    if (!String(card?.question || "").trim() || !String(card?.answer || "").trim()) add("flashcard", row, "incomplete-card", `card ${index + 1}`);
  });
}

for (const row of essays) {
  const questions = [
    ...(Array.isArray(row.short_answer_questions) ? row.short_answer_questions : []),
    ...(Array.isArray(row.long_answer_questions) ? row.long_answer_questions : []),
  ];
  if (!questions.length) add("essay", row, "empty", "no questions");
  questions.forEach((q, index) => {
    if (!String(q?.question || "").trim()) add("essay", row, "missing-question", `item ${index + 1}`);
    if (!String(q?.answer || q?.model_answer || "").trim()) add("essay", row, "missing-answer", `item ${index + 1}`);
  });
}

for (const row of stories) {
  const text = String(row.content || "").trim();
  if (text.length < 500) add("story", row, "thin-content", `${text.length} characters`);
}

const byCode = Object.fromEntries([...new Set(findings.map((x) => x.code))].sort().map((code) => [code, findings.filter((x) => x.code === code).length]));
const examples = Object.fromEntries(Object.keys(byCode).map((code) => [code, findings.filter((x) => x.code === code).slice(0, 12)]));
console.log(JSON.stringify({
  scanned: { articles: articles.length, mcq_sets: mcqs.length, flashcard_sets: flashcards.length, essays: essays.length, stories: stories.length },
  findingCount: findings.length,
  affectedResources: new Set(findings.map((x) => `${x.type}:${x.id}`)).size,
  byCode,
  examples,
}, null, 2));
