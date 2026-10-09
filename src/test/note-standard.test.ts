import { describe, expect, it } from "vitest";
import { lintNote, matchOutline, tidyNote, NOTE_PROMPT } from "@/lib/noteStandard";

const MESSY = `Sure! Here are your notes on Asthma:

# Asthma

---

## **1. Definition:**
Asthma is a chronic inflammatory airway disease. • Wheeze • Cough • Breathlessness

## Causes
* Allergens
* Cold air

---

## Practice Questions

## MCQs

**Q1.** Which drug is first-line for acute asthma?
a) Salbutamol b) Atenolol c) Digoxin d) Warfarin
Ans: A - Salbutamol is a beta-2 agonist.

Question 2
Which test confirms reversible obstruction?
A. Spirometry
B. ECG
C. CT head
D. Colonoscopy
Correct Answer: (A)
Rationale: Spirometry shows reversibility.

## Essay questions
1. Discuss the stepwise management of asthma. (10 marks)
Model Answer: Step 1 SABA; step 2 add ICS.

Let me know if you want more questions!`;

describe("tidyNote", () => {
  const out = tidyNote(MESSY, "Asthma");
  it("removes the chat lines, rules and the repeated title", () => {
    expect(out).not.toMatch(/Sure!|Let me know|^---/m);
    expect(out).not.toMatch(/^# /m);
  });
  it("cleans headings and bullets", () => {
    expect(out).toContain("## Definition");
    expect(out).toContain("- Allergens");
    expect(out).toMatch(/\n- Wheeze|• Wheeze/); // inline bullets are left alone, line bullets are fixed
  });
  it("puts questions, options and answers in the standard form", () => {
    expect(out).toContain("Question 1: Which drug is first-line for acute asthma?");
    expect(out).toMatch(/\nA\. Salbutamol\nB\. Atenolol\nC\. Digoxin\nD\. Warfarin\n/);
    expect(out).toContain("**Answer:** A");
    expect(out).toContain("**Explanation:** Salbutamol is a beta-2 agonist.");
    expect(out).toContain("Question 2: Which test confirms reversible obstruction?");
    expect(out).toContain("**Answer:** A\n**Explanation:** Spirometry shows reversibility.");
    expect(out).toContain("**Model answer:** Step 1 SABA; step 2 add ICS.");
  });
  it("leaves a clean note unchanged", () => {
    expect(tidyNote(out, "Asthma")).toBe(out);
  });
});

describe("lintNote", () => {
  it("flags what is wrong with the messy note and clears most of it after tidying", () => {
    const before = lintNote({ title: "Asthma", category: "Year 4: Internal Medicine", content: MESSY });
    const codes = before.issues.map((i) => i.code);
    expect(codes).toContain("chat");
    expect(codes).toContain("rules");
    expect(codes).toContain("h1");
    const after = lintNote({ title: "Asthma", category: "Year 4: Internal Medicine", content: tidyNote(MESSY, "Asthma") });
    expect(after.issues.filter((i) => i.fixable)).toHaveLength(0);
    expect(after.mcqs).toBe(2);
    expect(after.essays).toBe(1);
  });
  it("needs a category with the year", () => {
    expect(lintNote({ title: "Some good title", category: "Medicine", content: "word ".repeat(100) }).issues.some((i) => i.code === "category" && i.level === "error")).toBe(true);
  });
  it("catches an MCQ without an answer or with too few options", () => {
    const r = lintNote({ title: "Some good title", category: "Year 4: Internal Medicine", content: "## Key points\n\n- a\n\n" + "word ".repeat(100) + "\n\n## Practice Questions\n\n### MCQs\n\nQuestion 1: Stem?\nA. one\nB. two\n" });
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain("mcq-answer");
    expect(codes).toContain("mcq-options");
  });
});

describe("matchOutline", () => {
  it("finds the unit and reports that no outline exists for others", () => {
    expect(matchOutline("Year 4: Internal Medicine", "Pleural effusion").outline?.year).toBe(4);
    expect(matchOutline("Year 2: Embryology", "Gastrulation").outline).toBeNull();
    expect(matchOutline("Medicine", "x").note).toMatch(/No year/);
  });
});

describe("the ChatGPT prompt", () => {
  it("states the layout the site understands", () => {
    for (const s of ["Question 1:", "**Answer:**", "**Explanation:**", "**Model answer:**", "## Key points", "## Practice Questions"]) expect(NOTE_PROMPT).toContain(s);
  });
});
