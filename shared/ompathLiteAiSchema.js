/**
 * Strict, non-diagnostic output contract for the optional OmpathStudy Lite
 * language-model adapter. Only these concepts may be added to the deterministic
 * symptom vocabulary. Unknown or malformed model output is rejected.
 */
export const LITE_SYMPTOM_IDS = Object.freeze([
  "severe_breathing_difficulty",
  "chest_pain",
  "loss_of_consciousness",
  "seizure",
  "severe_bleeding",
  "pregnancy_bleeding",
  "reduced_fetal_movement",
  "fluid_leakage",
  "lower_abdominal_pain",
  "vaginal_discharge",
  "abnormal_vaginal_bleeding",
  "menstrual_problem",
  "fever",
  "vomiting",
  "dysuria",
  "severe_pain",
]);

const allowed = new Set(LITE_SYMPTOM_IDS);
const cleanText = (value, max = 80) => typeof value === "string"
  ? value.replace(/[<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) || null
  : null;

/**
 * Validate and normalise untrusted model output. This is an extraction
 * contract, not a diagnostic or triage assessment.
 */
export function validateLiteAiInterpretation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const ids = (input) => Array.isArray(input)
    ? [...new Set(input.filter((id) => typeof id === "string" && allowed.has(id)))].slice(0, 8)
    : [];
  const symptom_ids = ids(value.symptom_ids);
  const negated_symptom_ids = ids(value.negated_symptom_ids);
  const positive = symptom_ids.filter((id) => !negated_symptom_ids.includes(id));
  const severity = ["mild", "moderate", "severe"].includes(value.severity) ? value.severity : null;
  const pregnancy_context = ["pregnant", "possibly_pregnant", "not_pregnant", "unclear"].includes(value.pregnancy_context)
    ? value.pregnancy_context : "unclear";
  const confidence = ["low", "medium", "high"].includes(value.confidence) ? value.confidence : "low";

  return {
    symptom_ids: positive,
    negated_symptom_ids,
    onset: cleanText(value.onset),
    duration: cleanText(value.duration),
    severity,
    pregnancy_context,
    confidence,
    uncertain: value.uncertain !== false || confidence === "low",
  };
}

export function mergeLiteSymptomIds(deterministicIds = [], aiInterpretation = null) {
  const base = Array.isArray(deterministicIds) ? deterministicIds.filter((id) => allowed.has(id)) : [];
  const ai = validateLiteAiInterpretation(aiInterpretation);
  if (!ai || ai.confidence === "low" || ai.uncertain) return [...new Set(base)];
  return [...new Set([...base, ...ai.symptom_ids])].slice(0, 8);
}
