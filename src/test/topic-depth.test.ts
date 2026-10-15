import { describe, expect, it } from "vitest";
import { buildPrompt, buildDeepPrompt, sanitizeDeep, cleanChoices } from "../../supabase/functions/_shared/topicAi.js";
import { deepToText } from "../../supabase/functions/_shared/contentCheck.js";

const sec = (h: string) => ({ h, b: [`${h}: a clear point to learn`, `${h}: a second point to learn`] });
const viva = (i: number) => ({ q: `Examiner question number ${i}, what would you do next?`, a: `The key points of answer ${i}.` });
const mcq = (i: number) => ({ q: `A 40-year-old patient number ${i} presents with cough, what is the next step?`, o: ["Option one", "Option two", "Option three", "Option four"], a: 1, e: "Because option two is right." });
const clinical = { sections: ["Bedside: history and how to examine", "Investigations and how to read them", "Diagnosis, staging and severity"].map(sec) };
const management = { sections: ["Management step by step", "Complications and when to escalate"].map(sec) };
const exam = { facts: ["Number one to memorise", "Number two to memorise"], vivas: Array.from({ length: 9 }, (_, i) => viva(i + 1)), mcqs: [mcq(1), mcq(2)], cases: [{ v: "A 30-year-old woman presents with fever and cough for three weeks.", qs: [{ q: "What is the diagnosis?", a: "The most likely diagnosis is X." }, { q: "What is the next step?", a: "Do the test Y first." }] }], mistakes: ["Forgetting to check the second thing"] };

describe("revision page and deep exam notes", () => {
  it("the revision page is written short, as before (6-8 questions, no deep rules)", () => {
    const p = buildPrompt({ name: "Ascites", category: "Medicine" });
    expect(p).toContain("6-8");
    expect(p).not.toContain("DEPTH:");
    expect(cleanChoices({ level: "x", depth: "y" })).toMatchObject({ depth: "quick" });
  });

  it("each part of the deep notes prompt shows what the revision page has and asks for something different", () => {
    const base = { sections: [{ h: "Causes", b: ["Cirrhosis is the commonest cause"] }], exam: ["What is SAAG? — a gradient"] };
    const a = buildDeepPrompt({ name: "Ascites", category: "Medicine", base, part: "clinical" });
    const c = buildDeepPrompt({ name: "Ascites", category: "Medicine", base, part: "exam", past: ["Define ascites and list four causes."] });
    expect(a).toContain("Cirrhosis is the commonest cause");
    expect(a).toContain("Bedside: history and how to examine");
    expect(a).toContain("must not repeat it");
    expect(c).toContain("15 to 18 questions");
    expect(c).toContain("Define ascites and list four causes.");
    expect(c).toContain("PAST-PAPER");
    expect(a).not.toContain("PAST-PAPER");
  });

  it("the three parts are merged and checked: no doses, a real MCQ shape, and 'exam' lines for older readers", () => {
    const ok = sanitizeDeep([clinical, management, exam], "Ascites");
    expect(ok.sections).toHaveLength(5);
    expect(ok.vivas).toHaveLength(9);
    expect(ok.mcqs).toHaveLength(2);
    expect(ok.cases).toHaveLength(1);
    expect(ok.exam[0]).toContain(" — ");
    const dosed = sanitizeDeep([clinical, { sections: [...management.sections, { h: "Drugs", b: ["Give 500 mg twice daily", "Spironolactone is first line"] }] }, exam], "Ascites");
    expect(JSON.stringify(dosed)).not.toContain("500 mg");
    const badMcq = sanitizeDeep([clinical, management, { ...exam, mcqs: [{ ...mcq(1), a: 7 }, { ...mcq(2), o: ["Same", "Same", "Same", "Same"] }, mcq(3)] }], "Ascites");
    expect(badMcq.mcqs).toHaveLength(1);
  });

  it("deep notes that are too thin are refused, and a section made out of questions is dropped", () => {
    expect(() => sanitizeDeep([{ sections: [sec("Bedside")] }, exam], "Ascites")).toThrow();
    expect(() => sanitizeDeep([clinical, management, { vivas: [viva(1)] }], "Ascites")).toThrow();
    const withQuestionSection = sanitizeDeep([{ sections: [...clinical.sections, sec("Exam practice questions")] }, management, exam], "Ascites");
    expect(withQuestionSection.sections.map((s: { h: string }) => s.h)).not.toContain("Exam practice questions");
  });

  it("a '<' before a letter is kept readable (the database refuses anything that looks like a tag)", () => {
    const d = sanitizeDeep([{ sections: [{ h: "Tests", b: ["ALT <ULN means normal", "Another useful point here"] }, ...clinical.sections] }, management, exam], "Ascites");
    expect(JSON.stringify(d)).not.toMatch(/<[A-Za-z]/);
  });

  it("the first version of the deep notes (sections + exam lines) still reads", () => {
    const old = sanitizeDeep([{ sections: [...clinical.sections, ...management.sections], exam: Array.from({ length: 9 }, (_, i) => `Question ${i + 1} what next? — answer ${i + 1}`) }], "Ascites");
    expect(old.vivas).toHaveLength(9);
  });

  it("the text sent to the cross-check holds every part of the deep notes", () => {
    const text = deepToText(sanitizeDeep([clinical, management, exam], "Ascites"));
    expect(text).toContain("Numbers to memorise");
    expect(text).toContain("MCQ:");
    expect(text).toContain("Marked answer: B");
    expect(text).toContain("Case:");
  });
});

import { extractJson } from "../../supabase/functions/_shared/topicAi.js";
describe("reading JSON out of a model reply", () => {
  it("takes the first complete object and ignores what comes before or after it", () => {
    expect(extractJson('Here you go: {"a": 1, "b": {"c": "}"}} and also {"x": 2}')).toEqual({ a: 1, b: { c: "}" } });
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson('{"a": "unfinished')).toBeNull();
  });
});
