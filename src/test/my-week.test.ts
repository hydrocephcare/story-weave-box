import { describe, expect, it } from "vitest";
import { parseAssessment } from "@/pages/MyWeek";

describe("weekly assessment parsing", () => {
  it("reads questions, answers and short-answer questions", () => {
    const t = `Q1. Which organism causes tetanus?
A. Clostridium tetani
B. Clostridium difficile
C. Bacillus cereus
D. Listeria
E. Nocardia
Answer: A
Why: C. tetani makes tetanospasmin.

Q2. Tamoxifen is a
A. SERM
B. Aromatase inhibitor
C. GnRH agonist
D. Antiandrogen
E. Taxane
Answer: A
Why: It blocks oestrogen receptors in breast tissue.

Essay 1. Describe the mechanism of tamoxifen.
Essay 2. Outline the toxins of Clostridium tetani.`;
    const r = parseAssessment(t);
    expect(r.mcqs).toHaveLength(2);
    expect(r.mcqs[0].answer).toBe(0);
    expect(r.mcqs[0].options).toHaveLength(5);
    expect(r.essays).toHaveLength(2);
  });
});
