import { describe, expect, it } from "vitest";
import { adaptPregnancyQuestions } from "./ompathLiteFlow.js";

const questions = [
  { id: "emergency_screen", en: "Emergency?", sw: "Dharura?" },
  { id: "pregnancy_status", en: "Pregnant?", sw: "Mjamzito?" },
  { id: "gestation", en: "Weeks?", sw: "Wiki?" },
  { id: "pregnancy_bleeding_or_fluid", en: "Bleeding or fluid?", sw: "Damu au maji?" },
  { id: "pregnancy_movement", en: "Reduced movement?", sw: "Miondoko imepungua?" },
];

describe("adaptive pregnancy USSD questions", () => {
  it("skips gestation and fetal movement when not pregnant", () => {
    const result = adaptPregnancyQuestions(questions, "Pregnancy-related concern", ["2", "2"]);
    expect(result.map((q) => q.id)).toEqual([
      "emergency_screen", "pregnancy_status", "pregnancy_bleeding_or_fluid",
    ]);
    expect(result[2].en).toBe("Are you having vaginal bleeding?");
  });

  it("skips gestation and fetal movement when pregnancy status is uncertain", () => {
    const result = adaptPregnancyQuestions(questions, "Pregnancy-related concern", ["2", "3"]);
    expect(result.map((q) => q.id)).not.toContain("gestation");
    expect(result.map((q) => q.id)).not.toContain("pregnancy_movement");
  });

  it("skips fetal movement for gestation under 20 weeks", () => {
    const result = adaptPregnancyQuestions(questions, "Pregnancy-related concern", ["2", "1", "1"]);
    expect(result.map((q) => q.id)).not.toContain("pregnancy_movement");
  });

  it("retains fetal movement screening at 20 weeks or more", () => {
    const result = adaptPregnancyQuestions(questions, "Pregnancy-related concern", ["2", "1", "2"]);
    expect(result.map((q) => q.id)).toContain("pregnancy_movement");
  });

  it("does not change questions for other concern categories", () => {
    const result = adaptPregnancyQuestions(questions, "Lower abdominal pain", ["2", "2"]);
    expect(result.map((q) => q.id)).toEqual(questions.map((q) => q.id));
  });
});
