import { describe, expect, it } from "vitest";
import { rebalanceMcqAnswerLetters } from "@/lib/store";

describe("MCQ answer-position balancing", () => {
  const bank = Array.from({ length: 20 }, (_, index) => ({
    question: `Question ${index + 1}`,
    options: [`wrong-${index}-a`, `correct-${index}`, `wrong-${index}-c`, `wrong-${index}-d`, `wrong-${index}-e`],
    correct_answer: 1,
  }));

  it("spreads answers evenly without changing the answer", () => {
    const balanced = rebalanceMcqAnswerLetters(bank);
    const counts = [0, 0, 0, 0, 0];

    balanced.forEach((question, index) => {
      counts[question.correct_answer] += 1;
      expect(question.options[question.correct_answer]).toBe(`correct-${index}`);
      expect(question.correct_answer_text).toBe(`correct-${index}`);
    });

    expect(counts).toEqual([4, 4, 4, 4, 4]);
    expect(rebalanceMcqAnswerLetters(bank)).toEqual(balanced);
  });

  it("does not force a new letter on every question (that pattern would give answers away)", () => {
    const keys = rebalanceMcqAnswerLetters(Array.from({ length: 40 }, (_, i) => ({ ...bank[i % 20], question: `Stem ${i}` }))).map((q) => q.correct_answer);
    expect(keys.some((k, i) => i > 0 && k === keys[i - 1])).toBe(true);
  });

  it("leaves a bank that is already fair exactly as it is", () => {
    const fair = [1, 3, 0, 2, 2, 4, 1, 0, 3, 4, 0, 2, 1, 1, 4, 3, 0, 2, 4, 3].map((at, index) => {
      const options = [`w-${index}-0`, `w-${index}-1`, `w-${index}-2`, `w-${index}-3`, `w-${index}-4`];
      options[at] = `correct-${index}`;
      return { question: `Question ${index + 1}`, options, correct_answer: at };
    });
    rebalanceMcqAnswerLetters(fair).forEach((question, index) => {
      expect(question.options).toEqual(fair[index].options);
      expect(question.correct_answer).toBe(fair[index].correct_answer);
    });
  });

  it("keeps \"all of the above\" in its place", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ question: `Q${i}`, options: [`right-${i}`, "b", "c", "All of the above"], correct_answer: 0 }));
    rebalanceMcqAnswerLetters(items).forEach((question, index) => {
      expect(question.options).toEqual(items[index].options);
      expect(question.correct_answer).toBe(0);
    });
  });

  it("keeps answer identity across repeated balancing", () => {
    const once = rebalanceMcqAnswerLetters(bank);
    const twice = rebalanceMcqAnswerLetters(once);

    twice.forEach((question, index) => {
      expect(question.options[question.correct_answer]).toBe(`correct-${index}`);
      expect(question.correct_answer_text).toBe(`correct-${index}`);
    });
  });

  it("uses answer text as the authority when the stored index is stale", () => {
    const [balanced] = rebalanceMcqAnswerLetters([{
      question: "Which organism causes diphtheria?",
      options: ["Streptococcus pyogenes", "Corynebacterium diphtheriae", "Neisseria meningitidis"],
      correct_answer: 0,
      correct_answer_text: "Corynebacterium diphtheriae",
    }]);

    expect(balanced.options[balanced.correct_answer]).toBe("Corynebacterium diphtheriae");
    expect(balanced.correct_answer_text).toBe("Corynebacterium diphtheriae");
  });

  it("leaves essay and malformed items untouched", () => {
    const items = [{ question: "Essay", type: "essay" }, { question: "Broken", options: ["A"], correct_answer: 0 }];
    expect(rebalanceMcqAnswerLetters(items)).toEqual(items);
  });
});
