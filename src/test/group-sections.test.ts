import { describe, expect, it } from "vitest";
import { groupQuestionSections } from "@/lib/blog-content";

describe("groupQuestionSections", () => {
  it("moves multiple-choice sections ahead of written ones", () => {
    const out = groupQuestionSections("Intro\n## Section A: MCQs\n1. q\n## Section B: Short answer\nQ1\n## MCQs continued\n2. q2");
    expect(out.indexOf("MCQs continued")).toBeLessThan(out.indexOf("Short answer"));
    expect(out.startsWith("Intro")).toBe(true);
  });
  it("leaves a page already in order alone", () => {
    const s = "## MCQs\n1. q\n## Essays\nQ1";
    expect(groupQuestionSections(s)).toBe(s);
  });
});
