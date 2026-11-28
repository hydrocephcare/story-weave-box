import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const maintenance = readFileSync(new URL("../../api/_lib/topicMaintenance.js", import.meta.url), "utf8");
const aiChat = readFileSync(new URL("../../supabase/functions/_shared/aiChat.js", import.meta.url), "utf8");

function section(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from, `missing section: ${start}`).toBeGreaterThanOrEqual(0);
  expect(to, `missing section end: ${end}`).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe("medical note-bank provider separation", () => {
  it("drafts and repairs MCQs with Groq, then requires an independent Gemini check", () => {
    const mcqs = section(maintenance, "async function generateNoteMcqs", "async function generateNoteFlashcards");
    expect(mcqs).toContain("askGroqModel(");
    expect(mcqs).toContain("checkContent(");
    expect(mcqs).not.toContain("askModel(");
  });

  it("drafts, repairs and independently reviews flashcards before returning them", () => {
    const cards = section(maintenance, "async function generateNoteFlashcards", "export default async function handler");
    expect(cards).toContain("askGroqModel(");
    expect(cards).toContain("checkContent(");
    expect(cards).toContain("if(!review.validated)");
    expect(cards).toContain("return {cards,review}");
  });

  it("keeps MCQ hardening on Groq rather than silently switching to Gemini", () => {
    expect(aiChat).toContain("import { askGroqModel }");
    expect(aiChat).toContain("await askGroqModel(");
    expect(aiChat).not.toContain("askModel(");
  });

  it("preserves existing MCQ review/audit history during top-ups", () => {
    expect(maintenance).not.toContain("DELETE FROM public.mcq_review_log");
  });

  it("records the independent flashcard review model and timestamp", () => {
    expect(maintenance).toContain("review_model:review.model||null");
    expect(maintenance).toContain("reviewed_at:review.at||new Date().toISOString()");
  });
});
