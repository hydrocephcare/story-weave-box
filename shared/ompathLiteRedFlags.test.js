import { describe, expect, it } from "vitest";
import { detectEmergencyLanguage } from "./ompathLiteRedFlags.js";

describe("multilingual emergency phrase recognition", () => {
  it.each([
    ["Nashindwa kupumua", "severe_breathing_difficulty"],
    ["Kifua inabana", "chest_pain"],
    ["Nimezimia", "loss_of_consciousness"],
    ["Mtoto ana degedege", "seizure"],
    ["Natokwa damu nyingi sana", "severe_bleeding"],
    ["Maumivu yasiyovumilika", "severe_pain"],
  ])("recognises %s", (text, rule) => {
    expect(detectEmergencyLanguage(text).map((item) => item.rule)).toContain(rule);
  });

  it("does not flag a clearly negated Kiswahili breathing symptom", () => {
    expect(detectEmergencyLanguage("Sina shida ya kupumua")).toEqual([]);
  });
});
