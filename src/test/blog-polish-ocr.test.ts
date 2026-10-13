import { describe, expect, it } from "vitest";
import { isExamLike, kindOf, scanPages, soundPolish, withScans } from "../../api/_lib/blogPolishCore.js";

const header = ["DATE: AUGUST 5, 2014 TIME: 9.00 A.M. - 12.00 NOON", "SECTION A (30 MARKS): Attempt any THREE Questions."];
const questions = [
  "1. The Henderson-Hasselbalch equation is important in the calculation of the pH of a buffer solution.",
  "(a) With a specific, physiological example, explain the term buffer solution. (2 Marks)",
  "(b) Derive the Henderson Hasselbalch equation using a hypothetical weak acid HA. (3 Marks)",
  "2. State 4 functions of carbohydrates. (4 Marks)",
];
const cleanExam = [...header, ...questions].join("\n");
const brokenExam = [...header, ...questions, "Page 1 of 12 anr an pd . A", "O", "C——", "HO—C— H", "H—C— OH"].join("\n");
const pages = "![page 1](https://cdn.example.com/a-1.jpg)\n\n![page 2](https://cdn.example.com/a-2.jpg)";

describe("an exam typed from a scan", () => {
  it("is recognised even without 'Question N' lines", () => {
    expect(isExamLike(cleanExam)).toBe(true);
    expect(isExamLike("## Heart\n\nThe heart pumps blood. It has four chambers.")).toBe(false);
  });

  it("a clean typing gets the site's layout; a broken one is left to its scanned pages", () => {
    expect(kindOf(cleanExam)).toBe("questions");
    // broken typing: the AI does not rewrite it (it loses real content); the page shows the scanned pages instead
    expect(kindOf(brokenExam)).toBe("scan");
  });

  it("keeps the scanned pages under a cleaned paper", () => {
    const out = withScans("**1. Explain the term buffer solution. (2 marks)**", pages);
    expect(scanPages(pages)).toHaveLength(2);
    expect(out).toContain("## Original pages");
    expect(out).toContain("a-2.jpg");
    expect(withScans("text", "")).toBe("text");
  });

  it("allows debris to be dropped from a scanned page, but not real content", () => {
    const cleaned = brokenExam.replace(/Page 1 of 12.*\nO\nC——\nHO—C— H\nH—C— OH/, "");
    expect(soundPolish(brokenExam, cleaned, { headings: false, minWords: 0.7, minNums: 0.7 })).toBe("");
    expect(soundPolish(brokenExam, "SECTION A (30 MARKS)", { headings: false, minWords: 0.7, minNums: 0.7 })).not.toBe("");
  });
});
