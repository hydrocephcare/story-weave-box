import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { mdToHtml } from "@/lib/miniMarkdown.js";

const md = (s: string, o = {}) => mdToHtml(s, { skipTitle: true, questions: true, ...o }).html as string;

describe("notes with practice questions", () => {
  it("turns an MCQ into a card with options, and hides the answer behind a button", () => {
    const html = md(`## 13. Exam-style MCQs

**1. What is the first step?**

A. Complete the birth history
B. Ask about immunisation
C. Assess and support airway, breathing and circulation
D. Measure head circumference
E. Begin developmental assessment

**Answer: C.** A critically ill child must be stabilised first.

**2. Another question?**

A. One
B. Two
C. Three
D. Four

**Answer: B.** Because two.`);
    expect((html.match(/class="qa qa-mcq"/g) ?? []).length).toBe(2);
    expect(html).toContain('data-correct="C"');
    expect((html.match(/class="qa-opt"/g) ?? []).length).toBe(9);
    expect(html).toContain("<summary>Show answer</summary>");
    expect(html).toContain("<strong>Answer: C.</strong> Assess and support airway");
    expect(html).toContain("A critically ill child must be stabilised first.");
  });

  it("reads the standard layout (Question 1: … **Answer:** B **Explanation:** …)", () => {
    const html = md(`## MCQs

Question 1: Which drug is first-line?
A. Salbutamol
B. Atenolol
C. Digoxin
D. Warfarin
**Answer:** A
**Explanation:** It is a beta-2 agonist.`);
    expect(html).toContain('data-correct="A"');
    expect(html).toContain("It is a beta-2 agonist.");
  });

  it("makes a short question and its answer a tap-to-open answer, only under a questions heading", () => {
    const text = `## 12. Practice questions

**1. Why count respiratory rate while calm?**
Crying raises the rate.

**2. Name the four domains.**
Gross motor; fine motor; language; social.

## 2. Preparation

**1. Introduce yourself**
Then wash your hands.`;
    const html = md(text);
    expect((html.match(/class="qa qa-recall"/g) ?? []).length).toBe(2);
    expect(html).toContain("Crying raises the rate.");
    expect(html).toContain("<p><strong>1. Introduce yourself</strong>");
  });

  it("makes Key points and Learning objectives a card, and call-outs stand out", () => {
    const html = md(`## Learning objectives

- Take a history
- Examine a child

## Why it differs

**Core rule:** observe before touching.`);
    expect(html).toContain('<div class="note-card">');
    expect(html).toContain('<p class="callout">');
  });

  it("keeps a line break when a line ends with two spaces, and leaves papers alone by default", () => {
    expect(mdToHtml("one  \ntwo").html).toContain("one<br />two");
    const plain = mdToHtml("**1. Q?**\n\nA. a\nB. b\n\n**Answer: A.** x").html as string;
    expect(plain).not.toContain("qa-mcq");
  });

  it("lays out the real paediatrics note: every MCQ is a card and nothing is merged", () => {
    const text = fs.readFileSync("src/content/notes/paediatrics-history-taking-and-examination.md", "utf8");
    const html = md(text);
    const cards = (html.match(/class="qa qa-mcq"/g) ?? []).length;
    const recall = (html.match(/class="qa qa-recall"/g) ?? []).length;
    expect(cards).toBeGreaterThanOrEqual(8);
    expect(recall).toBeGreaterThanOrEqual(6);
    expect(html).not.toMatch(/A\. [^<]*B\. [^<]*C\. /); // options are never run together in one line
    expect(html).toContain('<div class="note-card">');
  });
});
