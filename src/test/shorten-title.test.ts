import { describe, expect, it } from "vitest";
import { shortenTitle } from "@/lib/blog-content";

describe("shortenTitle", () => {
  it("leaves a short title alone", () => expect(shortenTitle("Pleural effusion")).toBe("Pleural effusion"));
  it("keeps the part number and drops the source tag", () => {
    const t = shortenTitle("Medical Physiology — GIT, Renal, Endocrine & Neuro MCQs (Part 3 of 4) — MCQ Bank");
    expect(t.length).toBeLessThanOrEqual(60);
    expect(t.endsWith("· Part 3")).toBe(true);
    expect(t).not.toMatch(/\.\.\./);
  });
  it("never cuts a word in half", () => {
    const t = shortenTitle("Medical Physiology Paper I: Exam I Questions 51–100 with Answers and Explanations for Revision");
    expect(t.length).toBeLessThanOrEqual(60);
    expect(t).not.toMatch(/\.\.\./);
    expect("Medical Physiology Paper I: Exam I Questions 51–100 with Answers and Explanations for Revision").toContain(t);
  });
});
