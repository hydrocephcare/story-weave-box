import { describe, expect, it } from "vitest";
import { prioritiseClinicalQuestions, validateClinicalInterpretation } from "./ompathLiteInterpret.js";

describe("Lite clinical interpretation validation", () => {
  it("accepts only known question IDs and preserves uncertainty", () => {
    const result = validateClinicalInterpretation({
      detected_language: "mixed",
      normalized_summary: "Lower abdominal pain; pregnancy status not stated.",
      explicit_facts: ["Lower abdominal pain"],
      uncertainties: ["Pregnancy status", "Duration"],
      follow_up_priority_ids: ["pregnancy_possibility", "made_up_question", "severity"],
    }, "Lower abdominal pain");
    expect(result.detected_language).toBe("mixed");
    expect(result.uncertainties).toContain("Pregnancy status");
    expect(result.follow_up_priority_ids).toEqual(["pregnancy_possibility", "severity"]);
    expect(result.interpretation_source).toBe("ai_assisted_unverified");
  });

  it("rejects malformed or empty model output", () => {
    expect(validateClinicalInterpretation("not json", "Bleeding")).toBeNull();
    expect(validateClinicalInterpretation({ normalized_summary: " " }, "Bleeding")).toBeNull();
  });

  it("does not let AI reorder the pregnancy safety sequence", () => {
    const questions = [{ id: "emergency_screen" }, { id: "pregnancy_status" }, { id: "gestation" }, { id: "pregnancy_movement" }];
    const result = prioritiseClinicalQuestions(questions, { follow_up_priority_ids: ["pregnancy_movement"] }, "Pregnancy-related concern");
    expect(result.map((q) => q.id)).toEqual(questions.map((q) => q.id));
  });

  it("keeps the emergency and first category question fixed while adapting the remaining order", () => {
    const questions = [{ id: "emergency_screen" }, { id: "duration" }, { id: "fever" }, { id: "pregnancy_possibility" }, { id: "severity" }];
    const result = prioritiseClinicalQuestions(questions, { follow_up_priority_ids: ["severity", "pregnancy_possibility"] }, "Menstrual problem");
    expect(result.map((q) => q.id)).toEqual(["emergency_screen", "duration", "severity", "pregnancy_possibility", "fever"]);
  });
});
