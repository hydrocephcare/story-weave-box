import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../supabase/functions/_shared/topicAi.js", () => ({
  askModel: vi.fn(),
  askGeminiModel: vi.fn(),
}));

import { askGeminiModel } from "../../supabase/functions/_shared/topicAi.js";
import { reviewQuestions } from "../../api/_lib/generateExam.js";

describe("weekly exam independent MCQ review", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes the central Supabase AI environment to Gemini", async () => {
    const aiEnv = {
      OMPATH_SUPABASE_AI_URL: "https://example.invalid/functions/v1/ompath-ai",
      OMPATH_SUPABASE_AI_TOKEN: "workflow-or-admin-token",
    };
    vi.mocked(askGeminiModel).mockResolvedValue({
      text: JSON.stringify([{
        i: 0, your_answer: 2, status: "ok",
        options: ["Option A", "Option B", "Option C", "Option D", "Option E"],
        explanation: "The supplied answer is correct.",
      }]),
      model: "gemini-3.8-flash",
      provider: "gemini",
    } as any);
    const questions = [{
      question: "Which finding best supports the diagnosis?",
      options: ["Option A", "Option B", "Option C", "Option D", "Option E"],
      correct_answer: 2,
      explanation: "The supplied explanation.",
    }];

    const result = await reviewQuestions(questions, true, aiEnv);

    expect(askGeminiModel).toHaveBeenCalledTimes(1);
    expect(askGeminiModel).toHaveBeenCalledWith(
      expect.stringContaining("independent medical examiner"),
      { env: aiEnv, timeoutMs: 45000, maxTokens: 5000 },
    );
    expect(result.reviewerUnavailable).toBe(false);
    expect(result.kept).toHaveLength(1);
    expect(result.dropped).toBe(0);
  });

  it("fails closed when Gemini is unavailable", async () => {
    vi.mocked(askGeminiModel).mockRejectedValue(new Error("provider unavailable"));
    const result = await reviewQuestions([{
      question: "Question", options: ["A", "B", "C", "D", "E"],
      correct_answer: 0, explanation: "Reason.",
    }], true, { GEMINI_API_KEYS: "configured" });

    expect(askGeminiModel).toHaveBeenCalledTimes(2);
    expect(result.reviewerUnavailable).toBe(true);
    expect(result.kept).toHaveLength(0);
    expect(result.dropped).toBe(1);
  });
});
