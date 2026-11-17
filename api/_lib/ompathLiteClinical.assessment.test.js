import { describe, expect, it } from "vitest";
import { buildPreliminaryAssessment } from "./ompathLiteClinical.js";

const encounter = { concern_category: "Pregnancy-related concern", original_message: "I am pregnant and have bleeding." };

describe("OmpathStudy Lite preliminary assessment", () => {
  it("marks pregnancy bleeding for urgent in-person assessment", () => {
    const result = buildPreliminaryAssessment({ encounter, answers: [
      { question_id: "pregnancy_status", answer: "1" },
      { question_id: "pregnancy_bleeding_or_fluid", answer: "1" },
    ] });
    expect(result.urgency_level).toBe("urgent");
    expect(result.status).toBe("not_a_diagnosis");
    expect(result.possible_causes).toEqual([]);
  });

  it("never downgrades an explicit emergency flag", () => {
    const result = buildPreliminaryAssessment({ encounter, emergencyFlags: [{ rule: "seizure", positive: true }] });
    expect(result.urgency_level).toBe("emergency");
  });

  it("treats lower abdominal pain with possible pregnancy as urgent", () => {
    const result = buildPreliminaryAssessment({
      encounter: { concern_category: "Lower abdominal pain", original_message: "Pain low in my abdomen" },
      answers: [{ question_id: "pregnancy_possibility", answer: "1" }],
    });
    expect(result.urgency_level).toBe("urgent");
  });

  it("includes limitations and avoids claiming a diagnosis", () => {
    const result = buildPreliminaryAssessment({ encounter, answers: [] });
    expect(result.status).toBe("not_a_diagnosis");
    expect(result.clinical_examination).toBe("Not performed");
    expect(result.limitations.length).toBeGreaterThan(0);
  });
});