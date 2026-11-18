import { describe, expect, it } from "vitest";
import { interpretSymptomText } from "./ompathLiteLanguage.js";

describe("multilingual symptom phrase normalisation", () => {
  it("recognises common Kiswahili lower abdominal pain", () => {
    const result = interpretSymptomText("Tumbo inaniuma chini tangu jana");
    expect(result.symptoms.map((item) => item.id)).toContain("lower_abdominal_pain");
    expect(result.suggested_category).toBe("Lower abdominal pain");
    expect(result.original).toBe("Tumbo inaniuma chini tangu jana");
  });

  it("recognises Sheng and Kiswahili descriptions without replacing the original", () => {
    const result = interpretSymptomText("Nimebleed na hedhi imechelewa");
    expect(result.symptoms.map((item) => item.id)).toContain("abnormal_vaginal_bleeding");
    expect(result.symptoms.map((item) => item.id)).toContain("menstrual_problem");
    expect(result.suggested_category).toBeNull();
    expect(result.category_confidence).toBe("none");
  });

  it("recognises pregnancy warning phrases", () => {
    const result = interpretSymptomText("Mtoto hachezi na maji ya uzazi yanatoka");
    expect(result.symptoms.map((item) => item.id)).toEqual(expect.arrayContaining(["reduced_fetal_movement", "fluid_leakage"]));
    expect(result.suggested_category).toBe("Pregnancy-related concern");
    expect(result.category_confidence).toBe("high");
  });

  it("recognises vaginal discharge and associated fever", () => {
    const result = interpretSymptomText("Natoa uchafu ukeni na nina homa");
    expect(result.symptoms.map((item) => item.id)).toContain("vaginal_discharge");
    expect(result.symptoms.map((item) => item.id)).toContain("fever");
    expect(result.suggested_category).toBe("Vaginal discharge");
  });

  it("does not invent a symptom when the wording is not recognised", () => {
    const result = interpretSymptomText("Sijui vizuri kueleza kinachoendelea");
    expect(result.symptoms).toEqual([]);
    expect(result.normalized_summary).toBe("");
    expect(result.category_confidence).toBe("none");
  });

  it("returns an empty interpretation for blank input", () => {
    expect(interpretSymptomText("")).toMatchObject({ symptoms: [], suggested_category: null, category_confidence: "none" });
  });
});
