import { beforeEach, describe, expect, it, vi } from "vitest";

const { adminMock, envMock, mcqMock, flashcardMock, essayMock } = vi.hoisted(() => ({
  adminMock: vi.fn(),
  envMock: vi.fn(),
  mcqMock: vi.fn(),
  flashcardMock: vi.fn(),
  essayMock: vi.fn(),
}));
vi.mock("../../api/_lib/neonAdmin.js", () => ({ isNeonAdmin: adminMock }));
vi.mock("../../api/_lib/supabaseAiEnv.js", () => ({ supabaseAiEnv: envMock }));
vi.mock("../../supabase/functions/_shared/topicAi.js", () => ({ askModel: vi.fn(), askGroqModel: vi.fn() }));
vi.mock("../../supabase/functions/_shared/contentCheck.js", () => ({ checkContent: vi.fn() }));
vi.mock("../../supabase/functions/_shared/noteBanks.js", () => ({ generateNoteMcqs: mcqMock, generateNoteFlashcards: flashcardMock }));
vi.mock("../../supabase/functions/_shared/essayExam.js", () => ({ generateReviewedEssayPaper: essayMock }));

import handler from "../../api/_lib/generateContent.js";

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name: string, value: string) { this.headers[name] = value; return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
  };
}
const makeReq = (type: string, extra = {}) => ({
  method: "POST",
  headers: { authorization: "Bearer admin-token" },
  body: { type, notes: "Clinical study notes for an educational medical examination.", title: "Asthma", count: 12, ...extra },
});

describe("admin medical content generation routes", () => {
  beforeEach(() => {
    adminMock.mockReset().mockResolvedValue(true);
    envMock.mockReset().mockReturnValue({ GROQ_API_KEYS: "test-groq", GEMINI_API_KEYS: "test-gemini" });
    mcqMock.mockReset().mockResolvedValue({
      questions: [{ question: "Which finding supports asthma?", options: ["A", "B", "C", "D"], correct_answer: 0, explanation: "Explanation." }],
      review: { model: "gemini-review-test", at: "2026-11-28" },
    });
    flashcardMock.mockReset().mockResolvedValue({
      cards: [{ question: "What is asthma?", answer: "A chronic inflammatory airway disorder." }],
      review: { model: "gemini-review-test", at: "2026-11-28" },
    });
    essayMock.mockReset().mockResolvedValue({
      essays: { saqs: [{ question: "Explain asthma pathophysiology.", answer: "A structured answer.", aiReview: { status: "passed" } }], laqs: [] },
    });
  });

  it("routes MCQ generation through the independently reviewed note-bank workflow", async () => {
    const res = makeRes();
    await handler(makeReq("mcqs"), res);
    expect(mcqMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Asthma", content: expect.any(String) }), expect.any(Object), 12);
    expect((res.body as any)[0].aiReview).toMatchObject({ status: "passed", model: "gemini-review-test" });
  });

  it("routes flashcard generation through the independently reviewed note-bank workflow", async () => {
    const res = makeRes();
    await handler(makeReq("flashcards"), res);
    expect(flashcardMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Asthma", content: expect.any(String) }), expect.any(Object), 12);
    expect((res.body as any)[0].aiReview).toMatchObject({ status: "passed", model: "gemini-review-test" });
  });

  it("routes written exam generation through Groq plus Gemini review with six SAQs", async () => {
    const res = makeRes();
    await handler(makeReq("essay-qa"), res);
    expect(essayMock).toHaveBeenCalledWith(expect.objectContaining({ saqCount: 6, laqCount: 1, unit: "Medical notes" }));
    expect((res.body as any).saqs[0].aiReview.status).toBe("passed");
  });
});
