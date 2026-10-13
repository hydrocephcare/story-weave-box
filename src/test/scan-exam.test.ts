import { describe, expect, it } from "vitest";
import { examDamaged, lightClean, looksScanned, scanFirst } from "@/lib/blogFix";

const ocrExam = [
  "DATE: AUGUST 5, 2014 TIME: 9.00 A.M. - 12.00 NOON",
  "SECTION A (30 MARKS): Attempt any THREE Questions.",
  "l. The Henderson — Hasselbalch equation is important in the calculation of a pH of a buffer solution.",
  "(2 Marks)", "(3 Marks)", "(4 Marks)",
  "Page 1 of 12 anr an “pd . A",
  "O", "C——", "HO—C— H", "H—C— OH", "",
  "2 (a) State 4 functions of carbohydrates. (4 Marks):",
].join("\n");
const pages = "![p1](https://cdn.example.com/a-1.jpg)\n\n![p2](https://cdn.example.com/a-2.jpg)";

describe("a scanned exam whose typing is broken", () => {
  it("is recognised, and an ordinary note is not", () => {
    expect(examDamaged(ocrExam)).toBe(true);
    expect(looksScanned({ content: ocrExam })).toBe(true);
    expect(examDamaged("## Heart\n\nThe heart pumps blood. SECTION A (3 marks) is not an exam.")).toBe(false);
    expect(examDamaged("DATE: 5 AUG\nSECTION A (30 MARKS): Attempt any THREE.\n(2 Marks) (3 Marks) (4 Marks)\nA clean typed question about the kidney.")).toBe(false);
  });

  it("removes only the certain debris from the typed text", () => {
    const out = lightClean(ocrExam);
    expect(out).not.toContain("Page 1 of 12");
    expect(out).not.toContain("HO—C— H");
    expect(out).toContain("The Henderson");
    expect(out).toContain("State 4 functions of carbohydrates");
  });

  it("shows the scanned pages first and the typed text below", () => {
    const a = scanFirst({ title: "bchem EOY 2014 (2) — Past Paper Questions & Answers", content: ocrExam, original_notes: pages });
    const i = a.content.indexOf("a-1.jpg");
    expect(i).toBeGreaterThan(0);
    expect(a.content.indexOf("## Typed version")).toBeGreaterThan(i);
    expect(a.content).toContain("may contain mistakes");
    expect(a.content).toContain("The Henderson");
  });

  it("keeps the text when there are no pictures to show", () => {
    const a = { title: "x", content: ocrExam, original_notes: "" };
    expect(scanFirst(a)).toBe(a);
  });
});
