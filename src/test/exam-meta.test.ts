import { describe, expect, it } from "vitest";
import { examUnit, examYear, metaLine, setPath, shortTitle, weeklyDate } from "@/lib/examMeta";

describe("exam titles", () => {
  it("turns a weekly exam title into its unit and date", () => {
    const t = "Weekly Year 3: Medical Virology Exam - October 16, 2026 (Section A: MCQs)";
    expect(shortTitle(t, "Weekly Exam: Year 3: Medical Virology")).toBe("Medical Virology");
    expect(weeklyDate(t)).toBe("16 Oct 2026");
    expect(shortTitle("Weekly Pathology Exam - August 28, 2026 (Section A: MCQs)", "Weekly Exam: Pathology")).toBe("Pathology");
  });
  it("shortens long past-paper titles", () => {
    expect(shortTitle("Medical Virology CAT 2024/2025 — MKU MBMM 3333 MCQs with Answers")).toBe("Medical Virology CAT 2024/2025");
    expect(shortTitle("A".repeat(10) + " " + "word ".repeat(30)).length).toBeLessThanOrEqual(47);
  });
  it("reads unit and year from the category", () => {
    expect(examUnit("Weekly Exam: Year 2: GIT Physiology")).toBe("GIT Physiology");
    expect(examYear("Weekly Exam: Year 2: GIT Physiology")).toBe(2);
    expect(examYear("Weekly Exam: Pathology")).toBeNull();
    expect(metaLine({ category: "Year 4: Surgery", title: "x", question_count: 30, exam_year: null })).toBe("Surgery · Year 4 · 30 questions");
  });
  it("sends banks to practice and exams to the timed page", () => {
    expect(setPath({ id: "1", slug: "a-b", kind: "bank", title: "t" })).toBe("/mcqs/a-b");
    expect(setPath({ id: "1", slug: null, kind: "exam", title: "t" })).toBe("/exams/1/start");
  });
});

import { shuffleOptions } from "@/lib/mcqSet";
describe("option shuffling", () => {
  const q = { question: "q", options: ["alpha", "bravo", "charlie", "delta"], correct_answer: 2 };
  it("keeps the answer key pointing at the same option", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const [r] = shuffleOptions([q], seed);
      expect(r.options[r.correct_answer]).toBe("charlie");
      expect([...r.options].sort()).toEqual(["alpha", "bravo", "charlie", "delta"]);
    }
  });
  it("gives the same order for the same seed and leaves 'all of the above' questions alone", () => {
    expect(shuffleOptions([q], "x")).toEqual(shuffleOptions([q], "x"));
    const k = { question: "q", options: ["a1", "b1", "c1", "All of the above"], correct_answer: 3 };
    expect(shuffleOptions([k], "x")[0]).toEqual(k);
  });
});
