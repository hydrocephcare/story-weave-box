import { describe, expect, it } from "vitest";
import { mergeLiteSymptomIds, validateLiteAiInterpretation } from "./ompathLiteAiSchema.js";

describe("validateLiteAiInterpretation", () => {
  it("accepts only known symptom concepts and bounded structured fields", () => {
    expect(validateLiteAiInterpretation({
      symptom_ids: ["lower_abdominal_pain", "invented_diagnosis"],
      negated_symptom_ids: [],
      onset: "since yesterday",
      duration: "one day",
      severity: "moderate",
      pregnancy_context: "possibly_pregnant",
      confidence: "high",
      uncertain: false,
    })).toEqual({
      symptom_ids: ["lower_abdominal_pain"],
      negated_symptom_ids: [],
      onset: "since yesterday",
      duration: "one day",
      severity: "moderate",
      pregnancy_context: "possibly_pregnant",
      confidence: "high",
      uncertain: false,
    });
  });

  it("rejects non-object and malformed payloads safely", () => {
    expect(validateLiteAiInterpretation(null)).toBeNull();
    expect(validateLiteAiInterpretation("not json")).toBeNull();
    expect(validateLiteAiInterpretation([])).toBeNull();
    expect(validateLiteAiInterpretation({ symptom_ids: ["bad"], confidence: "certain" })).toMatchObject({
      symptom_ids: [], confidence: "low", uncertain: true,
    });
  });

  it("does not promote a symptom that the model marks as negated", () => {
    expect(validateLiteAiInterpretation({
      symptom_ids: ["fever", "chest_pain"],
      negated_symptom_ids: ["fever"],
      confidence: "high",
      uncertain: false,
    }).symptom_ids).toEqual(["chest_pain"]);
  });

  it("does not merge uncertain or low-confidence AI concepts", () => {
    expect(mergeLiteSymptomIds(["fever"], {
      symptom_ids: ["chest_pain"], confidence: "low", uncertain: true,
    })).toEqual(["fever"]);
    expect(mergeLiteSymptomIds(["fever"], {
      symptom_ids: ["chest_pain"], confidence: "high", uncertain: true,
    })).toEqual(["fever"]);
  });

  it("merges high-confidence concepts without duplicates", () => {
    expect(mergeLiteSymptomIds(["fever"], {
      symptom_ids: ["fever", "vomiting"], confidence: "high", uncertain: false,
    })).toEqual(["fever", "vomiting"]);
  });
});
