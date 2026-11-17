import { describe, expect, it } from "vitest";
import { detectEmergencyLanguage } from "./ompathLiteClinical.js";

describe("OmpathStudy Lite emergency phrase screening", () => {
  it("flags explicit severe breathing difficulty", () => {
    expect(detectEmergencyLanguage("I am struggling to breathe")).toHaveLength(1);
  });

  it("flags severe abdominal pain in English", () => {
    expect(detectEmergencyLanguage("I have severe abdominal pain")).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "severe_pain", positive: true })]),
    );
  });

  it("flags heavy bleeding described in Kiswahili", () => {
    expect(detectEmergencyLanguage("Ninatokwa damu nyingi sana")).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "severe_bleeding", positive: true })]),
    );
  });

  it("does not flag an explicitly negated English symptom", () => {
    expect(detectEmergencyLanguage("I do not have severe chest pain")).toHaveLength(0);
  });

  it("does not flag an explicitly negated Kiswahili symptom", () => {
    expect(detectEmergencyLanguage("Sina maumivu makali ya kifua")).toHaveLength(0);
  });

  it("does not invent an emergency from a mild symptom", () => {
    expect(detectEmergencyLanguage("I have a mild headache")).toHaveLength(0);
  });
});
