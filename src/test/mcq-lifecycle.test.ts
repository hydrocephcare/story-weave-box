import { describe, expect, it } from "vitest";
import { auditBank, balanceBank, seededRandom } from "../../supabase/functions/_shared/mcqPositions.js";
import { sanitizeDeep } from "../../supabase/functions/_shared/topicAi.js";
import { sanitizeMcqQuestions } from "@/lib/mcq-normalization";
import { normalizeMcqQuestions } from "@/lib/store";
import { shuffleOptions } from "@/lib/mcqSet";
import { placeAnswers } from "@/lib/gemini";
import { picksOf, restoreAnswers } from "@/lib/examAnswers";
import { displayOrder, scoreMcq } from "@/clinical/engine";
import { ALL_CASES } from "@/clinical";
import { BANK } from "@/clinical/bank";
import type { MCQ } from "@/clinical/types";

type Q = { question: string; options: string[]; correct_answer: number; explanation?: string; correct_answer_text?: string };
const allA = (n: number): Q[] => Array.from({ length: n }, (_, i) => ({
  question: `A ${30 + i}-year-old woman presents with sign ${i}. What is the most likely cause?`,
  options: [`right ${i}`, `wrong ${i} b`, `wrong ${i} c`, `wrong ${i} d`],
  correct_answer: 0,
  explanation: `Right ${i} is the cause of sign ${i}.`,
}));
const right = (q: Q) => q.options[q.correct_answer];
const chi = (counts: number[]) => { const n = counts.reduce((a, b) => a + b, 0), e = n / counts.length; return counts.reduce((s, c) => s + (c - e) ** 2 / e, 0); };

describe("stored bank -> site display -> grading", () => {
  it("keeps the graded answer identical through balancing, sanitising and the seeded display shuffle", () => {
    const stored = allA(30);
    const balanced = balanceBank(stored, { seed: "set-uuid" }).questions as Q[];
    const shown = shuffleOptions(sanitizeMcqQuestions(balanced) as Q[], "set-uuid");
    shown.forEach((q, i) => {
      expect(right(q)).toBe(`right ${i}`);
      expect(q.explanation).toBe(stored[i].explanation);
    });
    // grading as the exam page does (the chosen position against correct_answer): picking the right text scores every question, a wrong one none
    const score = (pick: (q: Q) => number) => shown.filter((q) => pick(q) === q.correct_answer).length;
    expect(score((q) => q.options.findIndex((o) => o.startsWith("right")))).toBe(30);
    expect(score((q) => q.options.findIndex((o) => o.startsWith("wrong")))).toBe(0);
  });

  it("shows the same set the same way every time (saved sessions line up) and repeated reshuffles never corrupt it", () => {
    const qs = sanitizeMcqQuestions(allA(12)) as Q[];
    expect(shuffleOptions(qs, "id-1")).toEqual(shuffleOptions(qs, "id-1"));
    let cur = qs;
    for (let r = 0; r < 25; r++) cur = shuffleOptions(cur, String(r));
    cur.forEach((q, i) => expect(right(q)).toBe(`right ${i}`));
  });

  it("evens out a bank on admin save (normalizeMcqQuestions) without touching a fair one", () => {
    const saved = normalizeMcqQuestions(allA(12));
    expect(auditBank(saved).counts).toEqual([3, 3, 3, 3]);
    saved.forEach((q, i) => expect(q.options?.[q.correct_answer ?? -1]).toBe(`right ${i}`));
    const again = normalizeMcqQuestions(saved);
    again.forEach((q, i) => expect(q.options).toEqual(saved[i].options));
  });

  it("places freshly generated AI questions evenly (application logic, not the prompt)", () => {
    const placed = placeAnswers(allA(20));
    expect(auditBank(placed).counts).toEqual([5, 5, 5, 5]);
    placed.forEach((q, i) => expect(right(q)).toBe(`right ${i}`));
  });

  it("copies a balanced exam into a contest round with the key pointing at the same option", () => {
    const exam = balanceBank(allA(20), { seed: "exam:round" }).questions as Q[];
    // the same mapping contest-control uses when it fills private.contest_answer_keys
    const round = exam.map((item) => ({ stem: item.question, options: item.options, correctIndex: Number(item.correct_answer) }));
    round.forEach((r, i) => expect(r.options[r.correctIndex]).toBe(`right ${i}`));
  });
});

describe("timed exams keep their saved answers and scores", () => {
  const questions = [
    { options: ["Iron deficiency", "B12 deficiency", "Thalassaemia", "Lead poisoning"], correct_answer: 0 },
    { options: ["Aspirin", "Heparin", "Warfarin", "Alteplase"], correct_answer: 2 },
  ];
  it("restores answers by option text after the options were reordered", () => {
    const answers = new Map([[0, 0], [1, 1]]);
    const picks = picksOf(answers, questions);
    const reordered = [
      { options: ["Thalassaemia", "Iron deficiency", "Lead poisoning", "B12 deficiency"], correct_answer: 1 },
      { options: ["Warfarin", "Alteplase", "Aspirin", "Heparin"], correct_answer: 0 },
    ];
    const restored = restoreAnswers([...answers.entries()], picks, reordered);
    expect(restored.get(0)).toBe(1);   // still "Iron deficiency" (right)
    expect(restored.get(1)).toBe(3);   // still "Heparin" (wrong)
    const score = [...restored.entries()].filter(([qi, oi]) => reordered[qi].correct_answer === oi).length;
    expect(score).toBe(1);
  });
  it("keeps the saved positions of older saves that have no option texts", () => {
    expect([...restoreAnswers([[0, 2], [1, 3]], undefined, questions)]).toEqual([[0, 2], [1, 3]]);
  });
});

describe("clinical questions (written with the right answer first)", () => {
  const collect = (o: unknown, out: MCQ[] = [], seen = new Set<unknown>()): MCQ[] => {
    if (!o || typeof o !== "object" || seen.has(o)) return out;
    seen.add(o);
    const m = o as MCQ;
    if (Array.isArray(m.options) && m.options[0] && typeof m.options[0] === "object" && "ok" in m.options[0]) out.push(m);
    for (const v of Object.values(o)) collect(v, out, seen);
    return out;
  };
  const single = [...collect(ALL_CASES), ...collect(BANK)].filter((q) => q.options.filter((x) => x.ok).length === 1);

  it("are shown with the right answer spread evenly over the letters", () => {
    const counts = [0, 0, 0, 0];
    for (const q of single.filter((x) => x.options.length === 4)) counts[displayOrder(q).options.findIndex((x) => x.ok)]++;
    expect(chi(counts)).toBeLessThan(11.34);
  });
  it("grade the same before and after reordering", () => {
    for (const q of single.slice(0, 60)) {
      const shown = displayOrder(q);
      expect(displayOrder(q)).toEqual(shown);
      const pick = shown.options.findIndex((x) => x.ok);
      expect(scoreMcq(shown, [pick], 0, false).allRight).toBe(true);
      expect(scoreMcq(shown, [(pick + 1) % shown.options.length], 0, false).allRight).toBe(false);
      expect(new Set(shown.options.map((x) => x.t))).toEqual(new Set(q.options.map((x) => x.t)));
    }
  });
});

describe("topic page deep notes", () => {
  it("deal their MCQ answers evenly whatever letter the model used, and keep each answer", () => {
    const section = (h: string) => ({ h, p: "A short paragraph about this part of the topic that is long enough.", b: ["A first bullet point", "A second bullet point"] });
    const sections = { sections: ["One", "Two", "Three", "Four", "Five", "Six"].map((x) => section(`Part ${x}`)) };
    const mcqs = Array.from({ length: 8 }, (_, i) => ({ q: `A 40-year-old patient number ${i} presents with cough, what is the next step?`, o: [`Right step ${i}`, `Other ${i} b`, `Other ${i} c`, `Other ${i} d`], a: 0, e: `Because right step ${i}.` }));
    const vivas = Array.from({ length: 9 }, (_, i) => ({ q: `Examiner question number ${i}, what would you do next?`, a: `The key points of answer ${i}.` }));
    const out = sanitizeDeep([sections, { vivas, mcqs }], "Pneumonia");
    expect(out.mcqs).toHaveLength(8);
    out.mcqs.forEach((m: { o: string[]; a: number }, i: number) => expect(m.o[m.a]).toBe(`Right step ${i}`));
    expect(auditBank(out.mcqs.map((m: { q: string; o: string[]; a: number }) => ({ question: m.q, options: m.o, correct_answer: m.a }))).counts).toEqual([2, 2, 2, 2]);
  });
});

describe("balancing many small banks together (the static notes)", () => {
  it("comes out even overall and is stable when run again", () => {
    const rand = seededRandom("notes");
    const banks = Array.from({ length: 60 }, (_, b) => allA(5).map((q, i) => {
      const at = rand() < 0.5 ? 1 : 2;   // a writer that favours B and C
      const options = [...q.options]; [options[0], options[at]] = [options[at], options[0]];
      return { ...q, question: `${q.question} ${b}`, options, correct_answer: at };
    }));
    const total = [0, 0, 0, 0];
    for (const [b, bank] of banks.entries()) {
      const once = balanceBank(bank, { seed: `note-${b}`, force: true, spreadExtras: true });
      once.after.counts.forEach((c: number, p: number) => { total[p] += c; });
      expect(balanceBank(once.questions, { seed: `note-${b}`, force: true, spreadExtras: true }).moves).toEqual([]);
      once.questions.forEach((q: Q, i: number) => expect(right(q)).toBe(right(bank[i])));
    }
    expect(chi(total)).toBeLessThan(11.34);
  });
});
