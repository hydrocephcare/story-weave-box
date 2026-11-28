import { describe, expect, it, vi } from "vitest";
import { reviewEssayPaper } from "../../api/_lib/essayReview.js";

const essays = {
  saqs: Array.from({ length: 4 }, (_, i) => ({ question: "SAQ " + i, answer: "A clinically structured answer." })),
  laqs: [{ question: "LAQ", answer: "A longer structured model answer." }],
};

describe("independent Gemini review of written exams", () => {
  it("checks the complete SAQ and LAQ paper before publication", async () => {
    const reviewer = vi.fn().mockResolvedValue({ validated: true, model: "gemini-3.8-flash", at: "2026-11-28", issues: [] });
    const result = await reviewEssayPaper({ unit: "Internal Medicine", essays, env: { GEMINI_API_KEYS: "test" }, reviewer });
    expect(result).toMatchObject({ validated: true, model: "gemini-3.8-flash" });
    expect(reviewer).toHaveBeenCalledWith(expect.objectContaining({
      title: "Internal Medicine",
      kind: "medical written examination SAQs, LAQs and model answers",
      env: { GEMINI_API_KEYS: "test" },
      timeoutMs: 45000,
    }));
    expect(reviewer.mock.calls[0][0].text).toContain('"SAQ 0"');
    expect(reviewer.mock.calls[0][0].text).toContain('"LAQ"');
  });

  it("fails closed when Gemini reports clinical or answer-quality issues", async () => {
    const reviewer = vi.fn().mockResolvedValue({ validated: false, model: "gemini-3.8-flash", issues: [{ severity: "high", problem: "Incorrect management answer." }] });
    const result = await reviewEssayPaper({ unit: "Surgery", essays, env: {}, reviewer });
    expect(result.validated).toBe(false);
    expect(result.issues).toHaveLength(1);
  });

  it("fails closed when a reviewer response has no model identity", async () => {
    const reviewer = vi.fn().mockResolvedValue({ validated: true, model: "", issues: [] });
    const result = await reviewEssayPaper({ unit: "Paediatrics", essays, env: {}, reviewer });
    expect(result.validated).toBe(false);
  });

  it("does not call the reviewer for an incomplete written paper", async () => {
    const reviewer = vi.fn();
    const result = await reviewEssayPaper({ unit: "Medicine", essays: { saqs: [], laqs: [] }, env: {}, reviewer });
    expect(result).toMatchObject({ validated: false, reason: "format" });
    expect(reviewer).not.toHaveBeenCalled();
  });

  it("does not swallow reviewer outages", async () => {
    const reviewer = vi.fn().mockRejectedValue(new Error("Gemini unavailable"));
    await expect(reviewEssayPaper({ unit: "Medicine", essays, env: {}, reviewer })).rejects.toThrow("Gemini unavailable");
  });
});
