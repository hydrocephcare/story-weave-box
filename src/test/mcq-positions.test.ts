import { describe, expect, it } from "vitest";
import {
  auditBank, balanceBank, correctIndex, moveAnswer, orderSensitive, placeNewQuestions, seededRandom, shuffleQuestionOptions, statedAnswerLetter,
} from "../../supabase/functions/_shared/mcqPositions.js";

type Q = { question: string; options: string[]; correct_answer: number; explanation?: string; correct_answer_text?: string; [k: string]: unknown };

const bank = (n: number, at: (i: number) => number, k = 4): Q[] => Array.from({ length: n }, (_, i) => {
  const options = Array.from({ length: k }, (_, j) => `wrong ${i}-${j}`);
  options[at(i)] = `right ${i}`;
  return { question: `A ${20 + i}-year-old presents with finding ${i}. What is the most likely diagnosis?`, options, correct_answer: at(i), explanation: `Right ${i} explains finding ${i}.`, id: `q${i}`, h: 1 };
});
const rightText = (q: Q) => q.options[q.correct_answer];
const chiOk = (counts: number[]) => { const n = counts.reduce((a, b) => a + b, 0), e = n / counts.length; return counts.reduce((s, c) => s + (c - e) ** 2 / e, 0) < 11.34; };

describe("correct answer identity", () => {
  it("uses the saved answer text when it matches one option, and flags a stale index", () => {
    const q = { question: "Which organism causes diphtheria?", options: ["Streptococcus pyogenes", "Corynebacterium diphtheriae", "Neisseria meningitidis", "Listeria"], correct_answer: 0, correct_answer_text: "Corynebacterium diphtheriae" };
    expect(correctIndex(q)).toEqual({ index: 1, source: "text", problem: "text-index-mismatch" });
    expect(correctIndex({ ...q, correct_answer: 1 })).toEqual({ index: 1, source: "text", problem: null });
  });

  it("flags missing, out-of-range and unmatched answers instead of guessing", () => {
    expect(correctIndex({ question: "x", options: ["a", "b", "c"], correct_answer: 7 }).index).toBe(-1);
    expect(correctIndex({ question: "x", options: ["a", "b", "c"], correct_answer: 9, correct_answer_text: "zzz" }).problem).toBe("text-not-found");
    // an out-of-date saved text with a valid number: the site grades by the number, so that is the answer
    expect(correctIndex({ question: "x", options: ["a", "b", "c"], correct_answer: 1, correct_answer_text: "zzz" })).toMatchObject({ index: 1, problem: null, staleText: true });
    expect(correctIndex({ question: "x", options: ["Malaria", "Arachnoid villi obstruction", "Typhoid"], correct_answer: 1, correct_answer_text: "Arachnoid villi" })).toMatchObject({ index: 1, problem: null });
    expect(correctIndex({ question: "x", options: ["Insulinoma state", "Glucagonoma state", "Acromegaly state"], correct_answer: 1, correct_answer_text: "Insulinoma" }).problem).toBe("text-index-mismatch");
    expect(correctIndex({ question: "x", options: ["a", "a", "c"], correct_answer: 1, correct_answer_text: "a" }).problem).toBe("duplicate-answer-text");
  });

  it("reads an answer letter stated in an explanation", () => {
    expect(statedAnswerLetter("Answer: C. Because ...")).toBe(2);
    expect(statedAnswerLetter("The correct answer is (B)")).toBe(1);
    expect(statedAnswerLetter("Iron deficiency is the answer here")).toBe(-1);
  });
});

describe("questions whose option order means something", () => {
  const base = { question: "A 30-year-old man presents with fever. What is the diagnosis?", options: ["Malaria", "Typhoid", "Dengue", "Influenza"], correct_answer: 0, explanation: "Malaria is common here." };
  it("may move an ordinary question", () => expect(orderSensitive(base)).toBe(""));
  it.each([
    ["options refer to each other", { options: ["Malaria", "Typhoid", "Both A and B", "None of the above"] }],
    ["an option names a letter", { options: ["Malaria", "Typhoid", "Option A", "Dengue"] }],
    ["the stem names a letter", { question: "Which structure labelled B is the ulnar nerve?" }],
    ["the explanation names a letter", { explanation: "Option C is wrong because dengue causes thrombocytopenia." }],
    ["the explanation gives the answer letter", { explanation: "Answer: A. Malaria." }],
    ["ascending doses", { options: ["5 mg", "10 mg", "20 mg", "40 mg"] }],
    ["descending values", { options: ["40%", "30%", "20%", "10%"] }],
    ["ordered grades", { options: ["Grade I", "Grade II", "Grade III", "Grade IV"] }],
    ["a sequence question", { question: "Arrange the stages of labour in the correct order." }],
    ["true/false", { options: ["True", "False"] }],
  ])("keeps the order when %s", (_name, patch) => expect(orderSensitive({ ...base, ...patch })).not.toBe(""));
  it("does not mistake vitamin or hepatitis letters for option letters", () => {
    expect(orderSensitive({ ...base, question: "Deficiency of vitamin A causes which eye finding?" })).toBe("");
    expect(orderSensitive({ ...base, options: ["Hepatitis B", "Hepatitis C", "Hepatitis E", "HIV"] })).toBe("");
  });
});

describe("moving an answer", () => {
  it("swaps only the right option with the target and keeps every other field", () => {
    const [q] = bank(1, () => 0);
    const moved = moveAnswer({ ...q, correct_answer_text: "right 0" }, 3);
    expect(moved.correct_answer).toBe(3);
    expect(rightText(moved)).toBe("right 0");
    expect(moved.correct_answer_text).toBe("right 0");
    expect([...moved.options].sort()).toEqual([...q.options].sort());
    expect(moved.options[1]).toBe(q.options[1]);
    expect(moved.options[2]).toBe(q.options[2]);
    for (const key of ["question", "explanation", "id", "h"]) expect(moved[key]).toBe((q as Q)[key]);
  });
});

describe("auditing a bank", () => {
  it("passes a fair bank", () => {
    const fair = bank(28, (i) => [0, 2, 1, 3, 3, 0, 2, 1, 1, 0, 3, 2, 2, 2, 0, 1, 3, 0, 1, 2, 0, 3, 3, 1, 0, 2, 1, 3][i]);
    expect(auditBank(fair).issues).toEqual([]);
  });
  it("flags one letter, uneven counts, never-repeating keys, stepping keys and long runs", () => {
    expect(auditBank(bank(12, () => 0)).issues).toContain("all-one-letter");
    expect(auditBank(bank(30, (i) => (i % 3 === 0 ? 1 : 3))).issues.join()).toMatch(/uneven|dominates/);
    expect(auditBank(bank(20, (i) => [0, 2, 1, 3][i % 4] === [0, 2, 1, 3][(i + 3) % 4] ? 0 : [0, 2, 1, 3][i % 4])).issues).toContain("never-repeats");
    expect(auditBank(bank(16, (i) => i % 4)).issues).toContain("stepping-pattern");
    expect(auditBank(bank(16, (i) => (i >= 4 && i < 11 ? 2 : i % 4))).issues).toContain("long-run");
  });
  it("judges 4- and 5-option questions separately and never reports question text", () => {
    const mixed = [...bank(10, () => 0, 4), ...bank(10, (i) => i % 5, 5)];
    const report = auditBank(mixed);
    expect(report.groups.map((g: { k: number }) => g.k)).toEqual([4, 5]);
    expect(report.issues).toContain("all-one-letter (4-option)");
    expect(JSON.stringify(report)).not.toMatch(/right|wrong|year-old/);
  });
  it("flags disagreements between stored answer, answer text and explanation", () => {
    const qs = bank(4, () => 0);
    qs[1] = { ...qs[1], correct_answer_text: qs[1].options[2] };
    qs[2] = { ...qs[2], explanation: "Answer: D" };
    qs[3] = { ...qs[3], correct_answer: 9 };
    expect(auditBank(qs).flagged.map((f: { reason: string }) => f.reason)).toEqual(["text-index-mismatch", "explanation-states-another-letter", "no-answer"]);
  });
});

describe("balancing a stored bank", () => {
  it("evens an all-A bank with the fewest moves and keeps every answer", () => {
    const qs = bank(12, () => 0);
    const { questions, moves, after } = balanceBank(qs, { seed: "set-1" });
    expect(after.counts).toEqual([3, 3, 3, 3]);
    expect(after.issues).toEqual([]);
    expect(moves.length).toBeGreaterThanOrEqual(9);
    questions.forEach((q: Q, i: number) => {
      expect(rightText(q)).toBe(`right ${i}`);
      expect(q.question).toBe(qs[i].question);
      expect(q.explanation).toBe(qs[i].explanation);
      expect([...q.options].sort()).toEqual([...qs[i].options].sort());
    });
  });

  it("leaves a fair bank exactly as it was", () => {
    const fair = bank(28, (i) => [0, 2, 1, 3, 3, 0, 2, 1, 1, 0, 3, 2, 2, 2, 0, 1, 3, 0, 1, 2, 0, 3, 3, 1, 0, 2, 1, 3][i]);
    const r = balanceBank(fair, { seed: "x" });
    expect(r.moves).toEqual([]);
    r.questions.forEach((q: Q, i: number) => expect(q).toBe(fair[i]));
  });

  it("only moves surplus answers when counts are uneven", () => {
    const qs = bank(30, (i) => (i % 5 === 4 ? i % 3 : 3));
    const r = balanceBank(qs, { seed: "s" });
    expect(r.before.issues).toEqual(["uneven"]);
    expect(r.after.issues).toEqual([]);
    expect(r.moves.length).toBe(24 - 8);
    expect(r.moves.every((m: { from: number }) => m.from === 3)).toBe(true);
    expect(chiOk(r.after.counts)).toBe(true);
  });

  it("is deterministic per seed and idempotent", () => {
    const qs = bank(20, () => 1);
    const a = balanceBank(qs, { seed: "same" });
    const b = balanceBank(qs, { seed: "same" });
    expect(a.questions).toEqual(b.questions);
    expect(balanceBank(a.questions, { seed: "same" }).moves).toEqual([]);
  });

  it("breaks a never-repeating key without changing the counts much", () => {
    const seq = [0, 1, 2, 3, 1, 0, 3, 2, 0, 2, 1, 3, 2, 0, 3, 1, 0, 3, 1, 2];
    const qs = bank(20, (i) => seq[i]);
    const r = balanceBank(qs, { seed: "nr" });
    expect(r.before.issues).toContain("never-repeats");
    expect(r.after.issues).toEqual([]);
    expect(r.after.counts).toEqual([5, 5, 5, 5]);
    r.questions.forEach((q: Q, i: number) => expect(rightText(q)).toBe(`right ${i}`));
  });

  it("never moves order-sensitive or doubtful questions", () => {
    const qs = bank(12, () => 0);
    qs[0] = { ...qs[0], options: ["right 0", "b", "c", "All of the above"] };
    qs[1] = { ...qs[1], explanation: "Option A is correct." };
    qs[2] = { ...qs[2], options: ["5 mg", "10 mg", "20 mg", "40 mg"] };
    qs[3] = { ...qs[3], correct_answer_text: qs[3].options[2] };
    const r = balanceBank(qs, { seed: "locks" });
    for (const i of [0, 1, 2, 3]) expect(r.questions[i]).toBe(qs[i]);
    expect(r.after.issues).toEqual([]);
  });

  it("does not leak the answer through a fixed rhythm (many seeds)", () => {
    let repeats = 0, pairs = 0;
    for (let s = 0; s < 200; s++) {
      const r = balanceBank(bank(30, () => 0), { seed: `bank-${s}` });
      const p = r.questions.map((q: Q) => q.correct_answer);
      for (let i = 1; i < p.length; i++) { pairs++; if (p[i] === p[i - 1]) repeats++; }
    }
    // a fair key repeats the previous letter about a quarter of the time; "never the same twice" would be 0
    expect(repeats / pairs).toBeGreaterThan(0.17);
    expect(repeats / pairs).toBeLessThan(0.33);
  });
});

describe("placing new questions", () => {
  it("deals even positions for a fresh AI batch whatever the writer did", () => {
    const placed = placeNewQuestions(bank(12, () => 0), { rand: seededRandom("t") });
    expect(auditBank(placed).counts).toEqual([3, 3, 3, 3]);
    placed.forEach((q: Q, i: number) => expect(rightText(q)).toBe(`right ${i}`));
  });
  it("fills the letters an existing bank is short of when topping up", () => {
    const existing = bank(12, (i) => (i < 6 ? 0 : 1));
    const placed = placeNewQuestions(bank(12, () => 0), { rand: seededRandom("t"), existing });
    expect(auditBank([...existing, ...placed]).counts).toEqual([6, 6, 6, 6]);
  });
  it("is unbiased over many batches and positions", () => {
    const at = [[0, 0, 0, 0], [0, 0, 0, 0]];
    const rand = seededRandom("many");
    for (let t = 0; t < 2000; t++) {
      const placed = placeNewQuestions(bank(5, () => 0), { rand });
      at[0][placed[0].correct_answer]++;
      at[1][placed[4].correct_answer]++;
    }
    expect(chiOk(at[0])).toBe(true);
    expect(chiOk(at[1])).toBe(true);
  });
});

describe("display shuffling", () => {
  it("keeps the answer with its option over repeated shuffles", () => {
    let q: Q = bank(1, () => 2)[0];
    const rand = seededRandom("r");
    for (let i = 0; i < 50; i++) { q = shuffleQuestionOptions(q, rand); expect(rightText(q)).toBe("right 0"); }
  });
  it("leaves order-sensitive questions alone", () => {
    const q = { question: "Dose?", options: ["5 mg", "10 mg", "20 mg"], correct_answer: 1 };
    expect(shuffleQuestionOptions(q, seededRandom("x"))).toBe(q);
  });
});
