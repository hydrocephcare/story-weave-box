import { describe, expect, it, vi } from "vitest";
import { requireMcqClinicalReview } from "@/lib/requireMcqClinicalReview";

const questions = [{ question: "A patient presents with...", options: ["A", "B", "C", "D"], correct_answer: 1, explanation: "..." }];

describe("admin MCQ clinical publication gate", () => {
  it("requires and records an independent Gemini review before saving", async () => {
    const client = { functions: { invoke: vi.fn().mockResolvedValue({ data: { validated: true, reviewModel: "gemini-3.8-flash", reviewedAt: "2026-11-28" }, error: null }) } };
    await expect(requireMcqClinicalReview(client, questions, "Asthma MCQs")).resolves.toEqual({ model: "gemini-3.8-flash", reviewedAt: "2026-11-28" });
    expect(client.functions.invoke).toHaveBeenCalledWith("generate-content", {
      body: { type: "review-mcqs", title: "Asthma MCQs", notes: JSON.stringify(questions) },
    });
  });

  it("blocks publication when Gemini finds a serious issue", async () => {
    const client = { functions: { invoke: vi.fn().mockResolvedValue({ data: { validated: false, reviewModel: "gemini-3.8-flash", issues: [{ problem: "The marked answer is incorrect." }] }, error: null }) } };
    await expect(requireMcqClinicalReview(client, questions)).rejects.toThrow("marked answer is incorrect");
  });

  it("blocks publication when the reviewer is unavailable", async () => {
    const client = { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: new Error("Gateway unavailable") }) } };
    await expect(requireMcqClinicalReview(client, questions)).rejects.toThrow("Gateway unavailable");
  });

  it("does not invoke the reviewer for an empty bank", async () => {
    const client = { functions: { invoke: vi.fn() } };
    await expect(requireMcqClinicalReview(client, [])).rejects.toThrow("no questions");
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });
});
