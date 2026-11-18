import { askJson } from "./llm.js";
import { validateLiteAiInterpretation } from "../../shared/ompathLiteAiSchema.js";

const SYSTEM_PROMPT = `You extract only symptoms and context explicitly stated by a patient. You are not a clinician and must not diagnose, triage, recommend treatment, or infer facts that were not stated.
Return one JSON object with exactly these fields:
{
  "symptom_ids": string[],
  "negated_symptom_ids": string[],
  "onset": string|null,
  "duration": string|null,
  "severity": "mild"|"moderate"|"severe"|null,
  "pregnancy_context": "pregnant"|"possibly_pregnant"|"not_pregnant"|"unclear",
  "confidence": "low"|"medium"|"high",
  "uncertain": boolean
}
Allowed symptom_ids only:
severe_breathing_difficulty, chest_pain, loss_of_consciousness, seizure, severe_bleeding, pregnancy_bleeding, reduced_fetal_movement, fluid_leakage, lower_abdominal_pain, vaginal_discharge, abnormal_vaginal_bleeding, menstrual_problem, fever, vomiting, dysuria, severe_pain.
Put explicitly denied symptoms in negated_symptom_ids, never in symptom_ids alone. Use an empty array when no listed symptom is clearly stated. Use null for missing onset, duration or severity. Do not translate uncertainty into a positive symptom. If language or meaning is unclear, set confidence to low and uncertain to true. Output JSON only.`;

const safeOriginal = (value) => String(value ?? "").replace(/[<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200);

/**
 * Optional LLM extraction. Caller must invoke this asynchronously after the
 * USSD response has been returned. This function never performs emergency
 * screening and its output must never reduce an existing urgency level.
 */
export async function interpretLiteWithAi(input) {
  const original = safeOriginal(input);
  if (!original) return { ok: false, reason: "empty_input" };
  const result = await askJson([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: original },
  ], { fast: true, temperature: 0, maxTokens: 240 });

  if (!result?.text) return { ok: false, reason: "provider_unavailable" };
  let parsed;
  try { parsed = JSON.parse(result.text); } catch { return { ok: false, reason: "invalid_json" }; }
  const interpretation = validateLiteAiInterpretation(parsed);
  if (!interpretation) return { ok: false, reason: "invalid_schema" };
  return { ok: true, interpretation };
}
