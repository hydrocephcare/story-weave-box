import { beforeEach, describe, expect, it, vi } from "vitest";

const { groqMock, reviewMock } = vi.hoisted(() => ({
  groqMock: vi.fn(),
  reviewMock: vi.fn(),
}));
vi.mock("../../supabase/functions/_shared/topicAi.js", () => ({ askGroqModel: groqMock }));
vi.mock("../../supabase/functions/_shared/contentCheck.js", () => ({ checkContent: reviewMock }));

import { generateReviewedEssayPaper, parseEssayPaper } from "../../supabase/functions/_shared/essayExam.js";

const paper = {
  saqs: Array.from({ length: 4 }, (_, i) => ({
    question: `Explain the clinical reasoning behind question ${i + 1} in this examination.`,
    model_answer: "A structured answer explaining the mechanism, clinical interpretation and appropriate management in sufficient detail.",
  })),
  laqs: [{
    question: "Discuss the pathophysiology, diagnosis and management of the clinical condition in this long-answer question.",
    model_answer: "A comprehensive answer covering relevant mechanisms, clinical features, investigations, differential diagnosis, management, complications and follow-up.",
  }],
};

describe("weekly written exam generation", () => {
  beforeEach(() => {
    groqMock.mockReset().mockResolvedValue({ text: JSON.stringify(paper), model: "groq-exam-test" });
    reviewMock.mockReset().mockResolvedValue({ validated: true, model: "gemini-review-test" });
  });

  it("parses exactly four SAQs and one LAQ with mark allocations", () => {
    const parsed = parseEssayPaper(JSON.stringify(paper));
    expect(parsed.saqs).toHaveLength(4);
    expect(parsed.laqs).toHaveLength(1);
    expect(parsed.saqs.every((q) => q.marks === 5)).toBe(true);
    expect(parsed.laqs[0].marks).toBe(20);
  });

  it("requires Groq generation followed by independent Gemini review", async () => {
    const result = await generateReviewedEssayPaper({
      prompt: "Write a clinical written examination.",
      title: "Weekly exam: Medicine",
      unit: "Medicine",
      env: { GROQ_API_KEYS: "groq-test-key", GEMINI_API_KEYS: "gemini-test-key" },
    });

    expect(groqMock).toHaveBeenCalledTimes(1);
    expect(reviewMock).toHaveBeenCalledTimes(1);
    expect(reviewMock.mock.calls[0][0].kind).toContain("long-answer examination");
    expect(result.review.model).toBe("gemini-review-test");
    expect(result.essays.saqs).toHaveLength(4);
    expect(result.essays.laqs[0].aiReview).toMatchObject({ status: "passed", model: "gemini-review-test" });
  });

  it("supports the six-SAQ admin paper format", async () => {
    const sixSaqPaper = {
      ...paper,
      saqs: Array.from({ length: 6 }, (_, i) => ({
        question: `Explain the clinical reasoning behind admin question ${i + 1} in this examination.`,
        model_answer: "A structured answer explaining the mechanism, clinical interpretation and appropriate management implications.",
      })),
    };
    groqMock.mockResolvedValueOnce({ text: JSON.stringify(sixSaqPaper), model: "groq-exam-test" });
    const result = await generateReviewedEssayPaper({
      prompt: "Write a six-SAQ medical exam.",
      title: "Medical written examination",
      unit: "Medicine",
      env: { GROQ_API_KEYS: "groq-test-key", GEMINI_API_KEYS: "gemini-test-key" },
      saqCount: 6,
      laqCount: 1,
    });
    expect(result.essays.saqs).toHaveLength(6);
    expect(result.essays.laqs).toHaveLength(1);
  });

  it("repairs a written paper with Groq and rechecks it with Gemini", async () => {
    reviewMock
      .mockResolvedValueOnce({ validated: false, model: "gemini-review-test", issues: [{ problem: "The model answer contains an incorrect clinical recommendation.", fix: "Use the appropriate evidence-based management step." }] })
      .mockResolvedValueOnce({ validated: true, model: "gemini-review-test" });

    const result = await generateReviewedEssayPaper({
      prompt: "Write a clinical written examination.",
      title: "Weekly exam: Medicine",
      unit: "Medicine",
      env: { GROQ_API_KEYS: "groq-test-key", GEMINI_API_KEYS: "gemini-test-key" },
    });

    expect(groqMock).toHaveBeenCalledTimes(2);
    expect(groqMock.mock.calls[1][0]).toContain("appropriate evidence-based management step");
    expect(reviewMock).toHaveBeenCalledTimes(2);
    expect(result.review.validated).toBe(true);
  });

  it("fails closed when Gemini still identifies a serious error after correction", async () => {
    reviewMock
      .mockResolvedValueOnce({ validated: false, model: "gemini-review-test", issues: [{ problem: "Incorrect clinical threshold.", fix: "Use the accepted threshold." }] })
      .mockResolvedValueOnce({ validated: false, model: "gemini-review-test", issues: [{ problem: "Incorrect clinical threshold remains.", fix: "Correct the threshold." }] });

    await expect(generateReviewedEssayPaper({
      prompt: "Write a clinical written examination.",
      title: "Weekly exam: Medicine",
      unit: "Medicine",
      env: { GROQ_API_KEYS: "groq-test-key", GEMINI_API_KEYS: "gemini-test-key" },
    })).rejects.toThrow("failed independent Gemini review");
  });
});
