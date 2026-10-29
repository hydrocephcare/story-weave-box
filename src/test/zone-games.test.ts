import { describe, expect, it, vi } from "vitest";

const mcqSets = [{ id: "m1", title: "Thyroid MCQs", category: "Year 2: Physiology", questions: Array.from({ length: 12 }, (_, i) => ({ question: `Thyroid question ${i}: which hormone is raised in Graves disease number ${i}?`, options: [`T3 ${i}`, `TSH ${i}`, `Cortisol ${i}`, `Insulin ${i}`], correct_answer: 0, explanation: "Graves disease raises T3 and T4." })) },
  { id: "m2", title: "Year 6 only", category: "Year 6: Surgery", questions: [{ question: "Should never appear for Year 2?", options: ["a", "b"], correct_answer: 0 }] }];
const cardSets = ["Thyroid", "Adrenal", "Pituitary", "Pancreas"].map((d, k) => ({ id: `f${k}`, title: `${d} flashcards`, category: "Year 2: Physiology", cards: ["Thyroxine", "Calcitonin", "Cortisol", "Aldosterone", "Glucagon", "Prolactin"].map((t, i) => ({ question: `${t}${d}${"x".repeat(0)}: what is it?`.replace(/x/g, ""), answer: `**${t} from the ${d} gland ${i}**\n- detail` })) }));

vi.mock("@/integrations/supabase/client", () => {
  const make = (table: string) => {
    const rows = table === "mcq_sets" ? mcqSets : cardSets;
    const b: any = { select: () => b, eq: () => b, is: () => b, or: () => b, limit: () => Promise.resolve({ data: rows }) };
    return b;
  };
  return { supabase: { from: make } };
});
vi.mock("@/lib/topicWriter", () => ({ askOmpathAi: vi.fn(async () => JSON.stringify({ process: "Coagulation", steps: ["Vessel injury", "Platelet plug", "Factor X activation", "Thrombin forms", "Fibrin clot"] })) }));

import { buildGame, GAMES } from "@/lib/zoneGames";
import type { ZoneGame } from "@/lib/zone";

const valid = (q: { q: string; options: string[]; correct: number }) => {
  expect(q.q.length).toBeGreaterThan(5);
  expect(q.options.length).toBeGreaterThanOrEqual(2);
  expect(q.correct).toBeGreaterThanOrEqual(0);
  expect(q.correct).toBeLessThan(q.options.length);
  expect(new Set(q.options).size).toBe(q.options.length); // no repeated options
};

describe("Friend Zone game builders", () => {
  for (const g of Object.keys(GAMES) as ZoneGame[]) {
    it(`${g}: every question has one valid right answer`, async () => {
      const r = await buildGame(g, "thyroid", 2, 8, "Physiology");
      expect(r.questions.length).toBeGreaterThan(2);
      r.questions.forEach(valid);
    });
  }
  it("never uses content from a higher year", async () => {
    const r = await buildGame("quiz", "thyroid", 2, 30, "");
    expect(JSON.stringify(r.questions)).not.toContain("Should never appear");
  });
  it("lightning statements are true or false and the key matches the claim", async () => {
    const r = await buildGame("lightning", "thyroid", 2, 10, "");
    for (const q of r.questions) { expect(q.options).toEqual(["True", "False"]); expect(q.q.startsWith("True or false?")).toBe(true); }
  });
  it("hangman hides letters of the right answer and the answer is one of the options", async () => {
    const r = await buildGame("hangman", "thyroid", 2, 6, "");
    for (const q of r.questions) { expect(q.q).toContain("_"); const word = q.options[q.correct].toUpperCase().replace(/[^A-Z]/g, ""); const shown = q.q.split("\n")[0].replace("Complete the word:", "").replace(/[^A-Z_]/g, ""); expect(shown.length).toBe(word.length); }
  });
  it("scramble uses the same letters as the answer", async () => {
    const r = await buildGame("scramble", "thyroid", 2, 6, "");
    for (const q of r.questions) { const word = q.options[q.correct].toUpperCase().replace(/[^A-Z]/g, "").split("").sort().join(""); const shown = q.q.split("\n")[0].replace("Unscramble:", "").replace(/[^A-Z]/g, "").split("").sort().join(""); expect(shown).toBe(word); }
  });
});
