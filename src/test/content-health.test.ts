import { describe, expect, it } from "vitest";
import { analyse, balanceLetters, parseQuestions } from "@/lib/contentHealth";

const q = (n: number, letter: string) => `Question ${n}\nWhich is correct about topic ${n}?\nA. First choice number ${n}\nB. Second choice number ${n}\nC. Third choice number ${n}\nD. Fourth choice number ${n}\nAnswer: ${letter}. ${{ A: "First", B: "Second", C: "Third", D: "Fourth" }[letter as "A"]} choice number ${n}\nExplanation: Because of reason ${n}.\n`;
const bank = (letters: string) => letters.split("").map((l, i) => q(i + 1, l)).join("\n");

describe("content health", () => {
  it("reads questions in the site's format", () => {
    const qs = parseQuestions(bank("ABCD"));
    expect(qs).toHaveLength(4);
    expect(qs[2].letter).toBe("C");
    expect(qs[0].opts).toHaveLength(4);
    expect(qs[0].hasExpl).toBe(true);
  });
  it("flags a bank whose answers are all the same letter", () => {
    const rep = analyse({ id: "1", title: "Anatomy MCQs 2019", category: "Year 2: Anatomy", content: bank("AAAAAAAAAAAA") });
    const codes = rep.issues.map((i) => i.code);
    expect(codes).toContain("letters");
    expect(codes).toContain("runs");
  });
  it("accepts a balanced bank", () => {
    const rep = analyse({ id: "1", title: "Anatomy MCQs 2019", category: "Year 2: Anatomy", content: bank("ABCDBADCDABC") });
    expect(rep.issues.map((i) => i.code)).not.toContain("letters");
  });
  it("flags thin pages, file-name titles and a missing year", () => {
    const rep = analyse({ id: "2", title: "scan0012.pdf", category: "Uncategorized", content: "short" });
    expect(rep.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["thin", "title", "category"]));
  });
  it("rebalances letters and keeps every answer pointing at its own option", () => {
    const content = bank("AAAAAAAAAAAA");
    const res = balanceLetters("abc12345", content);
    expect(res.changed).toBe(12);
    const after = parseQuestions(res.content);
    const dist = after.reduce<Record<string, number>>((m, x) => ((m[x.letter] = (m[x.letter] ?? 0) + 1), m), {});
    expect(Math.max(...Object.values(dist))).toBeLessThan(10);
    for (const x of after) { const i = "ABCD".indexOf(x.letter); expect(x.opts[i]).toMatch(/^(First|Second|Third|Fourth) choice/); }
    // the option that was right is still right
    const first = res.content.split("\n").find((l) => l.startsWith("Answer:"))!;
    expect(first).toContain("First choice number 1");
  });
  it("leaves questions that refer to each other alone", () => {
    const tricky = "Question 1\nStem here\nA. Option one\nB. Option two\nC. Option three\nD. All of the above\nAnswer: D. All of the above\nExplanation: All are right.\n";
    expect(balanceLetters("x", tricky).changed).toBe(0);
  });
});
