import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseQuestions } from "@/lib/dailyQuestion";
import { examOnly } from "@/lib/examMode";

describe("question of the day and exam mode", () => {
  it("reads questions from a real note", () => {
    const qs = parseQuestions(fs.readFileSync("src/content/notes/respiratory-tuberculosis.md", "utf8"));
    expect(qs.length).toBeGreaterThanOrEqual(3);
    for (const q of qs) { expect(q.options.length).toBeGreaterThanOrEqual(3); expect(q.answer).toBeGreaterThanOrEqual(0); expect(q.answer).toBeLessThan(q.options.length); }
  });
  it("exam mode keeps the introduction and the exam sections and drops the rest", () => {
    const html = "<p>intro</p><h2>Definition</h2><p>a</p><h2>Anatomy and physiology</h2><p>b</p><h2>High-yield exam points</h2><p>c</p><h2>Practice questions</h2><p>d</p>";
    const cut = examOnly(html);
    expect(cut).toContain("intro"); expect(cut).toContain("High-yield"); expect(cut).toContain("Practice questions");
    expect(cut).not.toContain("Anatomy and physiology");
  });
});
