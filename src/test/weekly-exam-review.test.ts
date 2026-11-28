import { beforeEach, describe, expect, it, vi } from "vitest";

const { geminiMock } = vi.hoisted(() => ({ geminiMock: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: vi.fn() }));
vi.mock("../../api/_lib/neonAdmin.js", () => ({ isNeonAdmin: vi.fn() }));
vi.mock("../../supabase/functions/_shared/topicAi.js", () => ({ askGroqModel: vi.fn(), askGeminiModel: geminiMock }));
vi.mock("../../supabase/functions/_shared/essayExam.js", () => ({ generateReviewedEssayPaper: vi.fn() }));
vi.mock("../../supabase/functions/_shared/mcqPositions.js", () => ({ balanceBank: vi.fn(), placeNewQuestions: vi.fn() }));
vi.mock("../../api/_lib/supabaseAiEnv.js", () => ({ supabaseAiEnv: vi.fn() }));

import { reviewQuestions } from "../../api/_lib/generateExam.js";

const questions = Array.from({ length: 10 }, (_, i) => ({
  question: `Which finding best supports clinical diagnosis number ${i + 1}?`,
  options: ["A", "B", "C", "D", "E"],
  correct_answer: 0,
  explanation: "The supplied answer is supported by the clinical context.",
}));

describe("weekly exam independent MCQ review", () => {
  beforeEach(() => geminiMock.mockReset());

  it("does not treat a bank as reviewed when Gemini returns an unusable response in non-strict review", async () => {
    geminiMock.mockResolvedValue({ text: "not valid JSON", model: "gemini-review-test" });
    const result = await reviewQuestions(questions, false, { GEMINI_API_KEYS: "test-key" });
    expect(result.reviewerUnavailable).toBe(true);
    expect(result.kept).toHaveLength(questions.length);
    expect(result.reviewModel).toBe(null);
  });

  it("fails closed and drops the chunk when Gemini returns an unusable response in strict weekly-exam review", async () => {
    geminiMock.mockResolvedValue({ text: "not valid JSON", model: "gemini-review-test" });
    const result = await reviewQuestions(questions, true, { GEMINI_API_KEYS: "test-key" });
    expect(result.reviewerUnavailable).toBe(true);
    expect(result.kept).toHaveLength(0);
    expect(result.dropped).toBe(questions.length);
  });

  it("drops questions when Gemini disagrees with the supplied answer key", async () => {
    geminiMock.mockResolvedValue({
      text: JSON.stringify(questions.map((q, i) => ({ i, your_answer: 1, status: "ok", options: q.options, explanation: q.explanation }))),
      model: "gemini-review-test",
    });
    const result = await reviewQuestions(questions, false, { GEMINI_API_KEYS: "test-key" });
    expect(result.kept).toHaveLength(0);
    expect(result.dropped).toBe(questions.length);
    expect(result.disputed).toHaveLength(questions.length);
  });

  it("fails closed on an unexpected Gemini status instead of accepting it", async () => {
    geminiMock.mockResolvedValue({
      text: JSON.stringify(questions.map((q, i) => ({ i, your_answer: 0, status: "uncertain", options: q.options, explanation: q.explanation }))),
      model: "gemini-review-test",
    });
    const result = await reviewQuestions(questions, false, { GEMINI_API_KEYS: "test-key" });
    expect(result.kept).toHaveLength(0);
    expect(result.dropped).toBe(questions.length);
  });

  it("records the actual Gemini reviewer model on a successful review", async () => {
    geminiMock.mockResolvedValue({
      text: JSON.stringify(questions.map((q, i) => ({ i, your_answer: 0, status: "ok", options: q.options, explanation: q.explanation }))),
      model: "gemini-review-test",
    });
    const result = await reviewQuestions(questions, true, { GEMINI_API_KEYS: "test-key" });
    expect(result.reviewerUnavailable).toBe(false);
    expect(result.kept).toHaveLength(questions.length);
    expect(result.reviewModel).toBe("gemini-review-test");
  });
});
