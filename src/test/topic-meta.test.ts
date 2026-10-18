import { describe, expect, it } from "vitest";
import { isJunkTopic, topicTitle } from "@/lib/topicMeta";

describe("topic names and titles", () => {
  it("rejects phrases that are not subjects", () => {
    for (const n of ["Types of", "Part 4 of 4", "Clinical Significance", "Specific Sequence", "Mount Kenya", "Multiple Choice", "Must-Know"]) expect(isJunkTopic(n)).toBe(true);
  });
  it("keeps real subjects, including short and acronym names", () => {
    for (const n of ["Hepatitis A", "Pleural Effusion", "Type 1 Diabetes", "Mycology Q&A", "Internal Medicine", "Central Nervous System", "G6PD Deficiency"]) expect(isJunkTopic(n)).toBe(false);
  });
  it("words the title to suit the kind of subject", () => {
    expect(topicTitle("Pleural Effusion", "Medicine")).toContain("causes, management");
    expect(topicTitle("Brachial Plexus", "Anatomy")).not.toContain("causes");
  });
});
