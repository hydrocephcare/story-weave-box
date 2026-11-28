import { beforeEach, describe, expect, it, vi } from "vitest";

const { adminMock, envMock, groqMock, reviewMock, mcqMock, flashcardMock, askJsonMock } = vi.hoisted(() => ({
  adminMock: vi.fn(),
  envMock: vi.fn(),
  groqMock: vi.fn(),
  reviewMock: vi.fn(),
  mcqMock: vi.fn(),
  flashcardMock: vi.fn(),
  askJsonMock: vi.fn(),
}));
vi.mock("../../api/_lib/adminAgent.js", () => ({ isAdmin: adminMock }));
vi.mock("../../api/_lib/llm.js", () => ({ askJson: askJsonMock }));
vi.mock("../../api/_lib/supabaseAiEnv.js", () => ({ supabaseAiEnv: envMock }));
vi.mock("../../supabase/functions/_shared/topicAi.js", () => ({ askGroqModel: groqMock }));
vi.mock("../../supabase/functions/_shared/contentCheck.js", () => ({ checkContent: reviewMock }));
vi.mock("../../supabase/functions/_shared/noteBanks.js", () => ({ generateNoteMcqs: mcqMock, generateNoteFlashcards: flashcardMock }));

import handler from "../../api/_lib/adminWrite.js";

function makeRes() {
  return {
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) { this.headers[name] = value; return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
  };
}
const request = (mode: string, extra = {}) => ({
  method: "POST",
  headers: { authorization: "Bearer admin-token" },
  body: { mode, text: "Clinical medical source notes with enough detail for a structured educational resource.", title: "Asthma", ...extra },
});

describe("admin medical writing requires independent Gemini review", () => {
  beforeEach(() => {
    adminMock.mockReset().mockResolvedValue(true);
    envMock.mockReset().mockReturnValue({ GROQ_API_KEYS: "test-groq", GEMINI_API_KEYS: "test-gemini" });
    groqMock.mockReset();
    reviewMock.mockReset().mockResolvedValue({ validated: true, model: "gemini-review-test", at: "2026-11-28T00:00:00Z" });
    mcqMock.mockReset();
    flashcardMock.mockReset();
    askJsonMock.mockReset();
  });

  it("Groq drafts a medical note and Gemini independently reviews it", async () => {
    groqMock.mockResolvedValueOnce({ text: JSON.stringify({
      title: "Asthma", category: "Medicine", content: "## Asthma\\n\\nA comprehensive clinical explanation of asthma and its mechanisms, presentation, investigations and management.",
      meta_title: "Asthma", meta_description: "Clear medical study notes on asthma and clinical management.",
    }), model: "groq-draft-test" });
    const res = makeRes();
    await handler(request("note"), res as never);
    expect(groqMock).toHaveBeenCalledTimes(1);
    expect(reviewMock).toHaveBeenCalledTimes(1);
    expect(reviewMock.mock.calls[0][0].kind).toBe("medical study note");
    expect((res.body as any).aiReview).toMatchObject({ status: "passed", model: "gemini-review-test" });
  });

  it("holds a medical note when Gemini still rejects it after correction", async () => {
    groqMock
      .mockResolvedValueOnce({ text: JSON.stringify({ title: "Asthma", content: "## Asthma\\n\\nAn initial clinical explanation that contains an inaccurate management statement and requires review." }) })
      .mockResolvedValueOnce({ text: JSON.stringify({ title: "Asthma", content: "## Asthma\\n\\nA corrected clinical explanation that still needs another independent review before publication." }) })
      .mockResolvedValueOnce({ text: JSON.stringify({ title: "Asthma", content: "## Asthma\\n\\nA second correction still requires independent clinical review before it can be approved." }) });
    reviewMock
      .mockResolvedValueOnce({ validated: false, model: "gemini-review-test", issues: [{ problem: "Incorrect management claim.", fix: "Use accepted management principles." }] })
      .mockResolvedValueOnce({ validated: false, model: "gemini-review-test", issues: [{ problem: "The management claim remains incomplete.", fix: "Correct the clinical statement." }] })
      .mockResolvedValueOnce({ validated: false, model: "gemini-review-test", issues: [{ problem: "Still inaccurate.", fix: "Correct it." }] });
    await expect(handler(request("note"), makeRes() as never)).rejects.toThrow("Independent Gemini review held");
    expect(reviewMock).toHaveBeenCalledTimes(3);
  });

  it("uses the reviewed MCQ generator for admin question banks", async () => {
    mcqMock.mockResolvedValueOnce({ questions: [{ question: "Which feature is typical of asthma?", options: ["Variable airflow limitation", "Pleural effusion", "Fixed obstruction", "Pulmonary fibrosis"], correct_answer: 0, explanation: "Asthma causes variable airflow limitation." }], review: { validated: true, model: "gemini-review-test" } });
    const res = makeRes();
    await handler(request("mcq", { count: 1 }), res as never);
    expect(mcqMock).toHaveBeenCalledTimes(1);
    expect(askJsonMock).not.toHaveBeenCalled();
    expect((res.body as any).aiReview.status).toBe("passed");
  });

  it("uses the reviewed flashcard generator for admin flashcards", async () => {
    flashcardMock.mockResolvedValueOnce({ cards: [{ question: "What is asthma?", answer: "A chronic inflammatory airway disease." }], review: { validated: true, model: "gemini-review-test" } });
    const res = makeRes();
    await handler(request("cards", { count: 1 }), res as never);
    expect(flashcardMock).toHaveBeenCalledTimes(1);
    expect(askJsonMock).not.toHaveBeenCalled();
    expect((res.body as any).aiReview.status).toBe("passed");
  });

  it("does not return imported MCQs for publication when Gemini rejects them", async () => {
    groqMock.mockResolvedValueOnce({ text: JSON.stringify({ questions: [{
      question: "Which feature is typical of asthma?",
      options: ["Variable airflow limitation", "Pleural effusion", "Fixed obstruction", "Pulmonary fibrosis"],
      correct_answer: 0, explanation: "Asthma causes variable airflow limitation.",
    }] }) });
    reviewMock.mockResolvedValueOnce({ validated: false, model: "gemini-review-test", issues: [{ problem: "The answer key is unsupported.", fix: "Recheck the correct answer." }] });
    const res = makeRes();
    await handler(request("mcq_import"), res as never);
    expect(res.statusCode).toBe(422);
    expect((res.body as any).error).toContain("independent Gemini");
  });
});
