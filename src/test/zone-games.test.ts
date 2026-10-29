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
const aiItems = Array.from({ length: 8 }, (_, i) => ({ q: `AI case ${i}: a 40 year old presents with number ${i}`, options: [`Dx A${i}`, `Dx B${i}`, `Dx C${i}`, `Dx D${i}`], correct: i % 4, explanation: "Because." }));
vi.mock("@/lib/topicWriter", () => ({ askOmpathAi: vi.fn(async (ask: string) => (ask.includes("JSON array") ? JSON.stringify(aiItems) : JSON.stringify({ process: "Coagulation", steps: ["Vessel injury", "Platelet plug", "Factor X activation", "Thrombin forms", "Fibrin clot"] }))) }));
const bankQs = Array.from({ length: 14 }, (_, i) => ({ id: `b${i}`, bankId: "bk", section: i < 7 ? "Forearm" : "Thigh", n: i, question: `State the nerve supply of the structure shown, picture ${i}`, image: `https://cdn.example.com/p${i}.jpg`, answer: `- Nerve number ${i}
- Another point ${i}` }));
vi.mock("@/lib/questionBank", () => ({ loadCatalog: async () => [{ id: "bk", title: "Aponeurosis Anatomy Question Bank", category: "Year 1: Aponeurosis - Anatomy" }, { id: "hi", title: "Year 6 spot bank", category: "Year 6: Surgery" }], loadBank: async (m: { id: string }) => (m.id === "bk" ? { id: "bk", title: "x", href: "/x", subject: "gross", questions: bankQs } : { id: "hi", title: "y", href: "/y", subject: "gross", questions: [{ ...bankQs[0], id: "hi1", answer: "- Should never appear" }] }) }));

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
      const r = await buildGame(g, g === "image" ? "aponeurosis" : "thyroid", 2, 8, "Physiology");
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
    for (const q of r.questions) { expect(q.options).toEqual(["True", "False"]); expect(q.q).toContain("Proposed answer:"); expect(q.kind).toBe("tf"); }
  });
  it("hangman hides letters of the right answer and the answer is one of the options", async () => {
    const r = await buildGame("hangman", "thyroid", 2, 6, "");
    for (const q of r.questions) { expect(q.q).toContain("_"); const word = q.options[q.correct].toUpperCase().replace(/[^A-Z]/g, ""); const shown = q.q.split("\n")[0].replace("Complete the word:", "").replace(/[^A-Z_]/g, ""); expect(shown.length).toBe(word.length); }
  });
  it("scramble uses the same letters as the answer", async () => {
    const r = await buildGame("scramble", "thyroid", 2, 6, "");
    for (const q of r.questions) { const word = q.options[q.correct].toUpperCase().replace(/[^A-Z]/g, "").split("").sort().join(""); const shown = q.q.split("\n")[0].replace("Unscramble:", "").replace(/[^A-Z]/g, "").split("").sort().join(""); expect(shown).toBe(word); }
  });
  it("image spot builds picture questions from the Aponeurosis banks and respects the year", async () => {
    const r = await buildGame("image", "aponeurosis", 2, 6, "");
    expect(r.questions.length).toBeGreaterThanOrEqual(4);
    for (const q of r.questions) { expect(q.image).toMatch(/^https:/); expect(q.kind).toBe("image"); valid(q); }
    expect(JSON.stringify(r.questions)).not.toContain("Should never appear");
  });
  it("quiz falls back to the picture banks when the site has no multiple-choice set on the topic", async () => {
    const r = await buildGame("quiz", "aponeurosis", 2, 30, "");
    expect(r.questions.some((q) => q.kind === "image")).toBe(true);
  });
});
