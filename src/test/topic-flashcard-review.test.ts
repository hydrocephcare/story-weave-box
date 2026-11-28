import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../supabase/functions/_shared/topicAi.js", () => ({
  askModel: vi.fn(),
  askGroqModel: vi.fn(),
  generateReviewedTopicPage: vi.fn(),
}));
vi.mock("../../supabase/functions/_shared/contentCheck.js", () => ({
  generateCheckedDeep: vi.fn(),
  checkContent: vi.fn(),
}));

import { askGroqModel } from "../../supabase/functions/_shared/topicAi.js";
import { checkContent } from "../../supabase/functions/_shared/contentCheck.js";
import { generateNoteFlashcards } from "../../api/_lib/topicMaintenance.js";

const env = { OMPATH_SUPABASE_AI_URL: "https://example.invalid/functions/v1/ompath-ai" };
const article = {
  title: "Acute asthma",
  category: "Medicine",
  content: "Acute asthma is an inflammatory airway disorder with variable airflow obstruction. ".repeat(20),
};
const cards = Array.from({ length: 10 }, (_, i) => ({
  question: "What is the important clinical principle number " + (i + 1) + " in acute asthma?",
  answer: "A clinically accurate answer with enough explanatory detail to support medical student revision. " + (i + 1),
}));

describe("medical note flashcard independent review", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses Groq for drafting and requires a successful independent review", async () => {
    vi.mocked(askGroqModel).mockResolvedValue({ text: JSON.stringify(cards), provider: "groq", model: "llama-test" } as any);
    vi.mocked(checkContent).mockResolvedValue({
      validated: true, high: 0, medium: 0, issues: [], model: "gemini-review-test", at: "2026-11-28",
    } as any);

    const result = await generateNoteFlashcards(article, env);

    expect(askGroqModel).toHaveBeenCalledTimes(1);
    expect(askGroqModel).toHaveBeenCalledWith(expect.stringContaining("high-yield revision flashcards"), expect.objectContaining({ env, timeoutMs: 18000 }));
    expect(checkContent).toHaveBeenCalledTimes(3);
    expect(checkContent).toHaveBeenCalledWith(expect.objectContaining({
      title: article.title, kind: "medical revision flashcards and their answers (batch 1)", env,
    }));
    expect(result.cards).toHaveLength(10);
    expect(result.review.model).toBe("gemini-review-test");
  });

  it("repairs flagged flashcards with Groq and independently reviews them again", async () => {
    vi.mocked(askGroqModel).mockResolvedValue({ text: JSON.stringify(cards), provider: "groq", model: "llama-test" } as any);
    vi.mocked(checkContent)
      .mockResolvedValueOnce({ validated: false, high: 1, medium: 0, issues: [{ severity: "high", where: "card", problem: "Incorrect", fix: "Correct it" }], model: "gemini-review-test", at: "2026-11-28" } as any)
      .mockResolvedValueOnce({ validated: true, high: 0, medium: 0, issues: [], model: "gemini-review-test", at: "2026-11-28" } as any)
      .mockResolvedValueOnce({ validated: true, high: 0, medium: 0, issues: [], model: "gemini-review-test", at: "2026-11-28" } as any)
      .mockResolvedValueOnce({ validated: true, high: 0, medium: 0, issues: [], model: "gemini-review-test", at: "2026-11-28" } as any)
      .mockResolvedValueOnce({ validated: true, high: 0, medium: 0, issues: [], model: "gemini-review-test", at: "2026-11-28" } as any)
      .mockResolvedValueOnce({ validated: true, high: 0, medium: 0, issues: [], model: "gemini-review-test", at: "2026-11-28" } as any);

    const result = await generateNoteFlashcards(article, env);

    expect(askGroqModel).toHaveBeenCalledTimes(2);
    expect(checkContent).toHaveBeenCalledTimes(6);
    expect(result.review.validated).toBe(true);
  });

  it("fails closed when independent Gemini review is unavailable", async () => {
    vi.mocked(askGroqModel).mockResolvedValue({ text: JSON.stringify(cards), provider: "groq", model: "llama-test" } as any);
    vi.mocked(checkContent).mockRejectedValue(new Error("Gemini unavailable"));

    await expect(generateNoteFlashcards(article, env)).rejects.toThrow("Gemini unavailable");
    expect(checkContent).toHaveBeenCalledTimes(3);
  });
});
