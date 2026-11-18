import { describe, expect, it } from "vitest";
import { buildPreliminaryAssessment } from "./ompathLiteRules.js";

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

  it("escalates an uncertain emergency-screen answer for urgent review", () => {
    const result = buildPreliminaryAssessment({
      encounter,
      answers: [{ question_id: "emergency_screen", answer: "3" }],
    });
    expect(result.urgency_level).toBe("urgent");
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

  it("labels gestational age and duration numerically rather than as yes/no", () => {
    const result = buildPreliminaryAssessment({
      encounter,
      answers: [
        { question_id: "gestation", answer: "2" },
        { question_id: "duration", answer: "3" },
      ],
    });
    expect(result.clarification_answers).toEqual([
      { question: "gestation", answer: "20-27 weeks" },
      { question: "duration", answer: "More than 7 days" },
    ]);
  });

  it("does not label vaginal bleeding as pregnancy bleeding when pregnancy is denied", () => {
    const result = buildPreliminaryAssessment({
      encounter,
      answers: [
        { question_id: "pregnancy_status", answer: "2" },
        { question_id: "pregnancy_bleeding_or_fluid", answer: "1" },
      ],
    });
    expect(result.urgency_level).toBe("prompt");
  });

  it("escalates bleeding when pregnancy status is uncertain", () => {
    const result = buildPreliminaryAssessment({
      encounter,
      answers: [
        { question_id: "pregnancy_status", answer: "3" },
        { question_id: "pregnancy_bleeding_or_fluid", answer: "1" },
      ],
    });
    expect(result.urgency_level).toBe("urgent");
  });

  it("escalates lower abdominal pain when pregnancy is possible but uncertain", () => {
    const result = buildPreliminaryAssessment({
      encounter: { concern_category: "Lower abdominal pain", original_message: "Lower abdominal pain" },
      answers: [{ question_id: "pregnancy_possibility", answer: "3" }],
    });
    expect(result.urgency_level).toBe("urgent");
  });

  it("escalates lower abdominal pain with fever or repeated vomiting", () => {
    const result = buildPreliminaryAssessment({
      encounter: { concern_category: "Lower abdominal pain", original_message: "Abdominal pain" },
      answers: [{ question_id: "fever_vomiting", answer: "1" }],
    });
    expect(result.urgency_level).toBe("urgent");
  });

  it("escalates bleeding with significant abdominal or pelvic pain", () => {
    const result = buildPreliminaryAssessment({
      encounter: { concern_category: "Bleeding", original_message: "Bleeding" },
      answers: [{ question_id: "pain", answer: "1" }],
    });
    expect(result.urgency_level).toBe("urgent");
  });

  it("escalates fever with vaginal discharge for same-day assessment", () => {
    const result = buildPreliminaryAssessment({
      encounter: { concern_category: "Vaginal discharge", original_message: "Discharge and fever" },
      answers: [{ question_id: "fever", answer: "1" }],
    });
    expect(result.urgency_level).toBe("urgent");
  });
  it("does not imply pregnancy when the caller says pregnancy is not possible", () => {
    const result = buildPreliminaryAssessment({
      encounter,
      answers: [
        { question_id: "pregnancy_status", answer: "2" },
        { question_id: "pregnancy_bleeding_or_fluid", answer: "1" },
      ],
    });
    expect(result.provisional_diagnosis).toMatch(/non-pregnancy-related cause/i);
    expect(result.differential_diagnoses).not.toContain("Threatened pregnancy loss (depending on gestation)");
  });

  it("escalates severe or worsening lower abdominal pain", () => {
    const result = buildPreliminaryAssessment({
      encounter: { concern_category: "Lower abdominal pain", original_message: "Lower abdominal pain" },
      answers: [{ question_id: "severity", answer: "1" }],
    });
    expect(result.urgency_level).toBe("urgent");
  });

  it("provides clinician-directed evaluation suggestions without claiming tests were done", () => {
    const result = buildPreliminaryAssessment({ encounter, answers: [] });
    expect(result.investigations).toBe("Not performed");
    expect(result.recommended_evaluation.length).toBeGreaterThan(0);
  });

  it("treats faintness with bleeding as a possible circulatory emergency", () => {
    const result = buildPreliminaryAssessment({
      encounter: { concern_category: "Bleeding", original_message: "Bleeding and faintness" },
      answers: [
        { question_id: "emergency_screen", answer: "2" },
        { question_id: "bleeding_amount", answer: "2" },
        { question_id: "faintness", answer: "1" },
      ],
    });
    expect(result.urgency_level).toBe("emergency");
    expect(result.next_steps[0]).toMatch(/emergency medical care now/i);
  });

});