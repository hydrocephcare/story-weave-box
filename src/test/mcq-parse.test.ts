import { describe, expect, it } from "vitest";
import { MCQ_SET_PROMPT, parseMcqText } from "@/lib/mcqParse";

describe("parseMcqText (ChatGPT formats)", () => {
  it("reads the plain standard layout", () => {
    const r = parseMcqText(`1. Which drug is first-line for acute asthma?
A. Salbutamol
B. Atenolol
C. Digoxin
D. Warfarin
Answer: A
Explanation: Salbutamol is a beta-2 agonist.

2. Which test confirms reversible airway obstruction?
A. ECG
B. Spirometry
C. CT head
D. Colonoscopy
Answer: B
Explanation: Spirometry before and after a bronchodilator.`);
    expect(r.skipped).toHaveLength(0);
    expect(r.questions).toHaveLength(2);
    expect(r.questions[0]).toMatchObject({ correct_answer: 0, explanation: "Salbutamol is a beta-2 agonist." });
    expect(r.questions[1].correct_answer).toBe(1);
  });

  it("reads bold markdown, brackets and answers with text", () => {
    const r = parseMcqText(`**Question 1:** A 25-year-old presents with wheeze after exercise. What is the most likely diagnosis?
**A.** Asthma
**B.** COPD
**C.** Heart failure
**D.** Pneumonia
**Answer:** A. Asthma
**Explanation:** Exercise-induced wheeze in a young patient.

**Q2)** Which organism causes cholera?
(a) Vibrio cholerae
(b) Shigella
(c) Salmonella
(d) E. coli
Correct answer: (A)`);
    expect(r.questions).toHaveLength(2);
    expect(r.questions[0].correct_answer).toBe(0);
    expect(r.questions[0].explanation).toBe("Exercise-induced wheeze in a young patient.");
    expect(r.questions[1].options[0]).toBe("Vibrio cholerae");
  });

  it("splits options written on one line and keeps a fifth option", () => {
    const r = parseMcqText(`1. First sign of raised intracranial pressure in an adult?
A) Headache B) Bradycardia C) Papilloedema D) Vomiting E) Coma
Answer: A`);
    expect(r.questions[0].options).toHaveLength(5);
  });

  it("never guesses: a missing answer is skipped and reported", () => {
    const r = parseMcqText(`1. A question with no answer line at all?
A. one
B. two
C. three
D. four

2. Another question that has the answer?
A. one
B. two
C. three
D. four
Answer: D`);
    expect(r.questions).toHaveLength(1);
    expect(r.questions[0].correct_answer).toBe(3);
    expect(r.skipped).toEqual([{ n: "1", why: "no answer given" }]);
  });

  it("skips an answer that is not an option and repeated questions", () => {
    const r = parseMcqText(`1. The same question twice here?
A. a
B. b
C. c
D. d
Answer: B

2. The same question twice here?
A. a
B. b
C. c
D. d
Answer: B

3. A question with only two options listed?
A. a
B. b
Answer: A`);
    expect(r.questions).toHaveLength(1);
    expect(r.skipped.map((s) => s.n)).toEqual(["2", "3"]);
  });

  it("has a prompt that asks for the layout it reads", () => {
    expect(MCQ_SET_PROMPT).toContain("Answer: C");
    expect(MCQ_SET_PROMPT).toContain("Explanation:");
  });
});
