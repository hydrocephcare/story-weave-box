import { describe, expect, it } from "vitest";
import { cleanExplanation, soundOption, soundQuestion, stemKey } from "@/lib/mcqQuality";

const good = { question: "The organism Clostridium perfringens multiplies in foods only under what conditions?", options: ["Aerobic", "Anaerobic", "Microaerophilic", "Facultative anaerobic"], correct_answer: 1, explanation: "It is an obligate anaerobe." };
// the damaged question seen on a student's phone
const broken = { question: "The organism Clostridium perfringens multiplies in foods only under ________ conditions.", options: ["aerobic", "freezing", "perfringens is an obligate/aerotolerant anaerobe; it requires an oxygen-poor environment (e.g., improperly cooled cooked meats) to…", "saline", "permissive Answer:"], correct_answer: 0 };

describe("which questions are fit to show", () => {
  it("accepts a clean question", () => { expect(soundQuestion(good)).toBe(true); });
  it("rejects the damaged question from the screenshot", () => {
    expect(soundQuestion(broken)).toBe(false);
    expect(soundOption("permissive Answer:")).toBe(false);
    expect(soundOption(broken.options[2])).toBe(false);
  });
  it("rejects a bad answer number, repeated options and too few options", () => {
    expect(soundQuestion({ ...good, correct_answer: 7 })).toBe(false);
    expect(soundQuestion({ ...good, correct_answer: -1 })).toBe(false);
    expect(soundQuestion({ ...good, options: ["Aerobic", "aerobic", "Anaerobic"] })).toBe(false);
    expect(soundQuestion({ ...good, options: ["Yes", "No"], correct_answer: 0 })).toBe(false);
  });
  it("treats copies of one question as the same, and different questions as different", () => {
    expect(stemKey({ question: "The organism Clostridium perfringens multiplies in foods only under conditions." })).toBe(stemKey({ question: "The organism Clostridium perfringens multiplies in foods only under conditions:" }));
    expect(stemKey({ question: "What causes tetanus?" })).not.toBe(stemKey({ question: "What causes botulism?" }));
  });
  it("cleans import debris from an explanation", () => {
    expect(cleanExplanation("It is an obligate anaerobe. ---")).toBe("It is an obligate anaerobe.");
    expect(cleanExplanation("*")).toBe("");
  });
});
