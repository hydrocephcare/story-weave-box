import { describe, expect, it } from "vitest";
import { resourceSeoTitle } from "@/lib/resourceSeoTitle";

describe("resource SEO titles", () => {
  it("removes repeated resource labels and distinguishes duplicate MCQ sets", () => {
    const first = resourceSeoTitle("Rheumatoid arthritis: MCQs | MCQs | Ompath Study", "rheumatoid-arthritis-mcqs", "Year 4: Internal Medicine", "MCQs");
    const second = resourceSeoTitle("Rheumatoid arthritis: MCQs", "rheumatoid-arthritis-1-mcqs", "Year 4: Internal Medicine", "MCQs");
    expect(first).not.toBe(second);
    expect(first).not.toMatch(/MCQs.*MCQs/i);
    expect(second).toContain("Set 1");
  });

  it("distinguishes prefixed flashcard decks and keeps the label once", () => {
    const title = resourceSeoTitle("Bleeding disorders: Flashcards", "3a-bleeding-disorders-flashcards", "Year 4: Pathology", "Flashcards");
    expect(title).toContain("Set 3a");
    expect(title).not.toMatch(/Flashcards.*Flashcards/i);
  });
});
