import { describe, expect, it, vi } from "vitest";
import { generateReviewedNoteEssays, generateReviewedNoteFlashcards } from "../../api/_lib/noteBankGeneration.js";

const article = {
  title: "Acute kidney injury",
  category: "Medicine",
  content: "Acute kidney injury is an abrupt decline in kidney function. Assessment uses serum creatinine, urine output, clinical context, and evaluation for pre-renal, intrinsic renal, and post-renal causes. Management includes identifying reversible causes, monitoring fluid balance and electrolytes, and escalating urgent complications.",
};

const groq = (value: unknown) => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(value) } }],
}), { status: 200, headers: { "Content-Type": "application/json" } });

const gemini = () => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: '{"verdict":"ok","issues":[]}' }] } }],
}), { status: 200, headers: { "Content-Type": "application/json" } });

describe("reviewed note-bank generation", () => {
  it("requires an independent Gemini check before returning flashcards", async () => {
    const cards = Array.from({ length: 8 }, (_, i) => ({
      question: "Acute kidney injury: explain clinical principle " + i,
      answer: "**Mechanism:** explain the renal process.\n- Interpret the clinical context and the change in kidney function.\n- Link the mechanism to the expected clinical findings.\n- Explain how the result changes monitoring and management.\nRelated: assess reversible causes and complications.",
    }));
    const fetchImpl = vi.fn().mockResolvedValueOnce(groq(cards)).mockResolvedValueOnce(gemini());

    const result = await generateReviewedNoteFlashcards(article, {
      GROQ_API_KEYS: "groq-test-key",
      GEMINI_API_KEYS: "gemini-test-key",
    }, fetchImpl);

    expect(result.cards).toHaveLength(8);
    expect(result.review.validated).toBe(true);
    expect(result.review.model).toBeTruthy();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0][0])).toContain("api.groq.com");
    expect(String(fetchImpl.mock.calls[1][0])).toContain("generativelanguage.googleapis.com");
  });

  it("creates four SAQs and one LAQ only after independent clinical review", async () => {
    const saqs = Array.from({ length: 4 }, (_, i) => ({
      question: "Discuss one important aspect of acute kidney injury " + i,
      answer: ["- **Definition**: explain the clinical concept.", "- **Causes**: identify common mechanisms.", "- **Assessment**: interpret relevant findings.", "- **Management**: explain safe initial principles."].join("\n"),
      marks: 5,
    }));
    const laqs = [{
      question: "Discuss the causes, assessment and management of acute kidney injury.",
      answer: Array.from({ length: 14 }, (_, i) => "- **Point " + (i + 1) + "**: explain a clinically relevant feature and its implications.").join("\n"),
      marks: 20,
    }];
    const fetchImpl = vi.fn().mockResolvedValueOnce(groq({ saqs, laqs })).mockResolvedValueOnce(gemini());

    const result = await generateReviewedNoteEssays(article, {
      GROQ_API_KEYS: "groq-test-key",
      GEMINI_API_KEYS: "gemini-test-key",
    }, fetchImpl);

    expect(result.saqs).toHaveLength(4);
    expect(result.laqs).toHaveLength(1);
    expect(result.review.validated).toBe(true);
    expect(result.review.model).toBeTruthy();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the independent reviewer cannot validate flashcards", async () => {
    const cards = Array.from({ length: 8 }, (_, i) => ({
      question: "Clinical question " + i,
      answer: "A sufficiently detailed answer with a direct explanation, clinical interpretation, management rationale and a related fact.",
    }));
    const fetchImpl = vi.fn().mockResolvedValueOnce(groq(cards)).mockResolvedValueOnce(new Response("review unavailable", { status: 503 }));

    await expect(generateReviewedNoteFlashcards(article, {
      GROQ_API_KEYS: "groq-test-key",
      GEMINI_API_KEYS: "gemini-test-key",
    }, fetchImpl)).rejects.toThrow();
  });
});
