import { describe, expect, it } from "vitest";
import { isExamLike, kindOf, scanPages, soundPolish, withScans } from "../../api/_lib/blogPolishCore.js";

const ocrExam = `DENTAL SURGERY
HBC 100/UPC 100/VBC 100: BIOCHEMISTRY
DATE: AUGUST 5, 2014 TIME: 9.00 A.M. - 12.00 NOON
SECTION A (30 MARKS): Attempt any THREE Questions.
l. The Henderson — Hasselbalch equation is important in the calculation of a pH of a buffer q Pp solution.
A With a specific, physiological example, explain the term “buffer solution”.
(2 Marks)
B Derive the Henderson Hasselbalch equation using a hypothetical weak acid HA.
(3 Marks)
Page 1 of 12 anr an “pd . A
O
C——
HO—C— H
2 (a) State 4 functions of carbohydrates. (4 Marks):`;

const pages = "![page 1](https://cdn.example.com/a-1.jpg)\n\n![page 2](https://cdn.example.com/a-2.jpg)";

describe("an exam typed from a scan", () => {
  it("is recognised even without 'Question N' lines, and needs cleaning", () => {
    expect(isExamLike(ocrExam)).toBe(true);
    expect(kindOf(ocrExam)).toBe("questions");
  });

  it("an ordinary note is not mistaken for an exam", () => {
    expect(isExamLike("## Heart\n\nThe heart pumps blood. It has four chambers and four valves.")).toBe(false);
    expect(kindOf("## Heart\n\nThe heart pumps blood.\n\n## Valves\n\nFour valves.")).toBe("note");
  });

  it("keeps the scanned pages under the cleaned paper", () => {
    const out = withScans("**1. Explain the term buffer solution. (2 marks)**", pages);
    expect(scanPages(pages)).toHaveLength(2);
    expect(out).toContain("## Original pages");
    expect(out).toContain("a-2.jpg");
    expect(withScans("text", "")).toBe("text");
  });

  it("allows the debris to be dropped from a scanned page, but not real content", () => {
    const cleaned = ocrExam.replace(/Page 1 of 12.*\nO\nC——\nHO—C— H\n/, "").replace("l. ", "1. ").replace(" q Pp", "");
    expect(soundPolish(ocrExam, cleaned, { headings: false, minWords: 0.7, minNums: 0.7 })).toBe("");
    expect(soundPolish(ocrExam, "SECTION A (30 MARKS)", { headings: false, minWords: 0.7, minNums: 0.7 })).not.toBe("");
  });
});
