import { describe, expect, it } from "vitest";
import { detectEmergencyLanguage } from "./ompathLiteRules.js";

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

  it("flags common shortness-of-breath wording", () => {
    expect(detectEmergencyLanguage("I have shortness of breath")).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "severe_breathing_difficulty", positive: true })]),
    );
  });

  it("flags chest pain even when the caller does not describe its severity", () => {
    expect(detectEmergencyLanguage("I have chest pain")).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "chest_pain", positive: true })]),
    );
  });

  it("does not flag explicitly denied chest pain", () => {
    expect(detectEmergencyLanguage("I do not have chest pain")).toHaveLength(0);
  });

  it("flags common Kiswahili inability-to-breathe wording", () => {
    expect(detectEmergencyLanguage("Siwezi kupumua")).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "severe_breathing_difficulty", positive: true })]),
    );
  });

  it("does not let an earlier negated symptom hide a later positive report", () => {
    expect(detectEmergencyLanguage("I do not have chest pain, but now I have chest pain")).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "chest_pain", positive: true })]),
    );
  });
  it("flags severe headache with visual changes", () => {
    expect(detectEmergencyLanguage("I have a severe headache with blurred vision")).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "severe_headache_or_visual_symptoms", positive: true })]),
    );
  });

  it("flags stroke warning signs", () => {
    expect(detectEmergencyLanguage("My speech is slurred and one-sided weakness started suddenly")).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "stroke_signs", positive: true })]),
    );
  });

  it("flags possible poisoning or overdose", () => {
    expect(detectEmergencyLanguage("I swallowed poison")).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "poisoning_or_overdose", positive: true })]),
    );
  });

  it("flags severe epigastric or upper abdominal pain", () => {
    expect(detectEmergencyLanguage("I have severe epigastric pain")).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "severe_epigastric_or_upper_abdominal_pain", positive: true })]),
    );
  });

  it("flags visual disturbance as a warning sign", () => {
    expect(detectEmergencyLanguage("I am seeing flashing lights")).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "visual_disturbance", positive: true })]),
    );
  });

  it("does not flag explicitly denied symptoms", () => {
    expect(detectEmergencyLanguage("I do not have chest pain and I don't feel faint")).toEqual([]);
  });

  it("flags shortness of breath and heavy bleeding described as one pad per hour", () => {
    expect(detectEmergencyLanguage("I am short of breath")).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "severe_breathing_difficulty", positive: true })]),
    );
    expect(detectEmergencyLanguage("I am bleeding one pad per hour")).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "severe_bleeding", positive: true })]),
    );
  });

});
