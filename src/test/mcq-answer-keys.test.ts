import { describe, expect, it } from "vitest";
import {
  answerKeyByQuestion,
  looksLikeUpcomingMcqOptions,
  mergeAnswerKeys,
  parseConsolidatedAnswerKey,
} from "@/lib/blog-content";

describe("answerKeyByQuestion", () => {
  it("reads explicit Answer: lines keyed off a bare numbered question", () => {
    const lines = [
      "1. Which meal is best taken with albendazole?",
      "A. Carbohydrates",
      "B. Proteins",
      "Answer: B",
      "2. Which is an armed tapeworm?",
      "A. Broad tapeworm",
      "B. Pork tapeworm",
      "Answer: B",
    ];
    const keys = answerKeyByQuestion(lines);
    expect(keys.get("1")).toBe("B");
    expect(keys.get("2")).toBe("B");
  });

  it("infers the answer from a single whole-line bold-wrapped option", () => {
    const lines = [
      "1. Which single statement below is correct?",
      "A. wrong one",
      "B. also wrong",
      "**C. this is bolded as the correct choice**",
      "D. wrong again",
    ];
    expect(answerKeyByQuestion(lines).get("1")).toBe("C");
  });

  it("does not guess when a question has more than one bold-wrapped option", () => {
    const lines = [
      "1. Ambiguous bolding",
      "**A. bolded for emphasis, not correctness**",
      "B. plain",
      "**C. also bolded**",
    ];
    expect(answerKeyByQuestion(lines).has("1")).toBe(false);
  });

  it("prefers an explicit Answer: line over bold-option inference", () => {
    const lines = [
      "1. Question text",
      "**A. bolded but wrong**",
      "B. actually correct",
      "Answer: B",
    ];
    expect(answerKeyByQuestion(lines).get("1")).toBe("B");
  });

  it("reads an Answer: line prefixed with a markdown bullet dash", () => {
    const lines = [
      "- **Which hormone promotes anabolism?**A) GH",
      "- B) Insulin",
      "- C) Cortisol",
      "- **Answer: B) Insulin**",
    ];
    // No numbered question header here, but the bullet-prefixed answer line
    // itself must still be recognized once a question is in scope.
    const withHeader = ["1. Which hormone promotes anabolism?", ...lines];
    expect(answerKeyByQuestion(withHeader).get("1")).toBe("B");
  });
});

describe("parseConsolidatedAnswerKey", () => {
  it("extracts a trailing comma-separated answer list", () => {
    const content = "The marked scan lists: **1 D, 2 C, 3 D, 4 D, 5 D, 6 D, 7 A.**";
    const keys = parseConsolidatedAnswerKey(content);
    expect(keys.get("1")).toBe("D");
    expect(keys.get("2")).toBe("C");
    expect(keys.get("7")).toBe("A");
  });

  it("keeps the first letter of an ambiguous 'A/C' style entry", () => {
    const content = "1 D, 2 C, 3 D, 4 D, 5 D, 6 A/C";
    expect(parseConsolidatedAnswerKey(content).get("6")).toBe("A");
  });

  it("ignores short runs so stray digit-letter pairs in prose aren't mistaken for a key", () => {
    const content = "See table 12 B for details, and figure 3 A elsewhere in the text.";
    expect(parseConsolidatedAnswerKey(content).size).toBe(0);
  });

  it("returns an empty map when there is no consolidated key at all", () => {
    expect(parseConsolidatedAnswerKey("Just some ordinary article prose.").size).toBe(0);
  });
});

describe("mergeAnswerKeys", () => {
  it("lets the primary map win over the fallback for the same question", () => {
    const primary = new Map([["1", "A"]]);
    const fallback = new Map([["1", "B"], ["2", "C"]]);
    const merged = mergeAnswerKeys(primary, fallback);
    expect(merged.get("1")).toBe("A");
    expect(merged.get("2")).toBe("C");
  });
});

describe("looksLikeUpcomingMcqOptions", () => {
  it("is true when the next lines are lettered options", () => {
    const lines = ["### 3. Some question", "A. one", "B. two", "C. three"];
    expect(looksLikeUpcomingMcqOptions(lines, 0)).toBe(true);
  });

  it("is false for an ordinary numbered section heading followed by prose", () => {
    const lines = ["### 3. Overview", "This section introduces the topic.", "More prose follows here."];
    expect(looksLikeUpcomingMcqOptions(lines, 0)).toBe(false);
  });

  it("is false for a numbered list item followed by unrelated list items", () => {
    const lines = ["1. First step", "2. Second step", "3. Third step"];
    expect(looksLikeUpcomingMcqOptions(lines, 0)).toBe(false);
  });
});
