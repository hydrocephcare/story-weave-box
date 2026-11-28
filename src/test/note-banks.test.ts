import { beforeEach, describe, expect, it, vi } from "vitest";

const { groqMock, reviewMock, weaknessMock, hardenMock, positionMock } = vi.hoisted(() => ({
  groqMock: vi.fn(),
  reviewMock: vi.fn(),
  weaknessMock: vi.fn(() => []),
  hardenMock: vi.fn(),
  positionMock: vi.fn((items: unknown[]) => items),
}));

vi.mock("../../supabase/functions/_shared/topicAi.js", () => ({ askGroqModel: groqMock }));
vi.mock("../../supabase/functions/_shared/contentCheck.js", () => ({ checkContent: reviewMock }));
vi.mock("../../supabase/functions/_shared/mcqHarden.js", () => ({ weakness: weaknessMock, hardenBatch: hardenMock }));
vi.mock("../../supabase/functions/_shared/mcqPositions.js", () => ({ placeNewQuestions: positionMock }));

import { dedupeNoteMcqs, generateNoteFlashcards, generateNoteMcqs } from "../../supabase/functions/_shared/noteBanks.js";

const article = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Asthma",
  category: "Medicine",
  content: "Asthma clinical study note. ".repeat(200),
};
const cards = Array.from({ length: 10 }, (_, i) => ({
  question: `Asthma revision question number ${i + 1}?`,
  answer: `Asthma is a chronic inflammatory airway disorder characterised by variable expiratory airflow limitation. This card explains airway hyperresponsiveness, common triggers, episodic wheeze, cough, chest tightness, objective confirmation, differential diagnoses, inhaled therapy, exacerbation prevention, monitoring, prognosis and patient education. It connects pathophysiology with clinical decisions and safe follow-up for medical students.`,
}));
const questions = Array.from({ length: 12 }, (_, i) => ({
  question: `Which clinical feature is most consistent with asthma number ${i + 1}?`,
  options: ["Variable expiratory airflow limitation", "Fixed upper airway obstruction", "Reduced lung compliance", "Pleural fluid accumulation"],
  correct_answer: 0,
  explanation: "Asthma is characterised by variable expiratory airflow limitation.",
}));

describe("note MCQ deduplication", () => {
  it("does not re-add questions already present in the bank", () => {
    const fresh = [{ question: "What is the mechanism of asthma?" }, { question: "Define status asthmaticus" }];
    const result = dedupeNoteMcqs(fresh, ["What is the mechanism of asthma?"]);
    expect(result).toEqual([{ question: "Define status asthmaticus" }]);
  });
});

describe("note-derived MCQs and flashcards", () => {
  beforeEach(() => {
    groqMock.mockReset();
    reviewMock.mockReset().mockResolvedValue({ validated: true, model: "gemini-review-test" });
    weaknessMock.mockReset().mockReturnValue([]);
    hardenMock.mockReset();
    positionMock.mockClear();
  });

  it("generates note MCQs with Groq and independently reviews them", async () => {
    groqMock.mockResolvedValueOnce({ text: JSON.stringify(questions), model: "groq-test-model" });

    const result = await generateNoteMcqs(article, { GROQ_API_KEYS: "groq-test-key" }, 12);

    expect(groqMock).toHaveBeenCalledTimes(1);
    expect(groqMock.mock.calls[0][0]).toContain("Asthma");
    expect(reviewMock).toHaveBeenCalledTimes(1);
    expect(reviewMock.mock.calls[0][0].kind).toBe("medical multiple-choice questions");
    expect(result.questions).toHaveLength(12);
    expect(result.review.model).toBe("gemini-review-test");
  });

  it("repairs MCQs with Groq when Gemini review finds a clinical issue", async () => {
    reviewMock
      .mockResolvedValueOnce({ validated: false, model: "gemini-review-test", issues: [{ problem: "The distractors are not sufficiently distinct.", fix: "Use clinically plausible alternatives." }] })
      .mockResolvedValueOnce({ validated: true, model: "gemini-review-test" });
    groqMock
      .mockResolvedValueOnce({ text: JSON.stringify(questions), model: "groq-test-model" })
      .mockResolvedValueOnce({ text: JSON.stringify(questions), model: "groq-test-model" });

    const result = await generateNoteMcqs(article, { GROQ_API_KEYS: "groq-test-key" }, 12);

    expect(groqMock).toHaveBeenCalledTimes(2);
    expect(groqMock.mock.calls[1][0]).toContain("clinically plausible alternatives");
    expect(reviewMock).toHaveBeenCalledTimes(2);
    expect(result.review.validated).toBe(true);
  });

  it("repairs small requested MCQ banks without imposing an eight-question minimum", async () => {
    const five = questions.slice(0, 5);
    reviewMock
      .mockResolvedValueOnce({ validated: false, model: "gemini-review-test", issues: [{ problem: "One answer needs correction.", fix: "Use the supported answer." }] })
      .mockResolvedValueOnce({ validated: true, model: "gemini-review-test" });
    groqMock
      .mockResolvedValueOnce({ text: JSON.stringify(five), model: "groq-test-model" })
      .mockResolvedValueOnce({ text: JSON.stringify(five), model: "groq-test-model" });
    const result = await generateNoteMcqs(article, { GROQ_API_KEYS: "groq-test-key" }, 5);
    expect(result.questions).toHaveLength(5);
    expect(reviewMock).toHaveBeenCalledTimes(2);
  });

  it("generates flashcards with Groq and requires independent Gemini review before returning", async () => {
    groqMock.mockResolvedValueOnce({ text: JSON.stringify(cards), model: "groq-test-model" });

    const result = await generateNoteFlashcards(article, { GROQ_API_KEYS: "groq-test-key" });

    expect(groqMock).toHaveBeenCalledTimes(1);
    expect(groqMock.mock.calls[0][0]).toContain("high-yield revision flashcards");
    expect(reviewMock).toHaveBeenCalledTimes(1);
    expect(reviewMock.mock.calls[0][0].kind).toBe("medical revision flashcards");
    expect(result.cards).toHaveLength(10);
    expect(result.review.model).toBe("gemini-review-test");
  });

  it("respects a requested flashcard count below five", async () => {
    groqMock.mockResolvedValueOnce({ text: JSON.stringify(cards.slice(0, 3)), model: "groq-test-model" });
    const result = await generateNoteFlashcards(article, { GROQ_API_KEYS: "groq-test-key" }, 3);
    expect(result.cards).toHaveLength(3);
    expect(reviewMock).toHaveBeenCalledTimes(1);
  });

  it("repairs flashcards and rechecks them before returning", async () => {
    reviewMock
      .mockResolvedValueOnce({ validated: false, model: "gemini-review-test", issues: [{ problem: "A card contains an unsupported clinical claim.", fix: "Remove the unsupported claim and use only the source note." }] })
      .mockResolvedValueOnce({ validated: true, model: "gemini-review-test" });
    groqMock
      .mockResolvedValueOnce({ text: JSON.stringify(cards), model: "groq-test-model" })
      .mockResolvedValueOnce({ text: JSON.stringify(cards), model: "groq-test-model" });

    const result = await generateNoteFlashcards(article, { GROQ_API_KEYS: "groq-test-key" });

    expect(groqMock).toHaveBeenCalledTimes(2);
    expect(groqMock.mock.calls[1][0]).toContain("Remove the unsupported claim");
    expect(reviewMock).toHaveBeenCalledTimes(2);
    expect(result.review.validated).toBe(true);
  });
});
