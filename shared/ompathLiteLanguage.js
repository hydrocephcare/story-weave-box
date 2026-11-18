/**
 * Conservative multilingual symptom phrase normalisation for OmpathStudy Lite.
 *
 * This is a curated phrase matcher, not an LLM, diagnostic engine or
 * translation service. It preserves the original patient text and returns
 * candidate symptom labels only. It must never be used to rule out disease.
 */
const clean = (value, max = 1200) => String(value ?? "")
  .normalize("NFKC")
  .replace(/[<>]/g, " ")
  .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, max);

const normalise = (value) => clean(value).toLocaleLowerCase("en")
  .replace(/[’']/g, "'")
  .replace(/\b(?:niko na|nina|naskia|nasikia|nahisi|natoa|inatoka|inauma|inauma sana)\b/g, (m) => m);

const phraseGroups = [
  { id: "severe_breathing_difficulty", label: "difficulty breathing", category: "Other health concern", phrases: ["cannot breathe", "can't breathe", "difficulty breathing", "shortness of breath", "nashindwa kupumua", "siwezi kupumua", "napumua kwa shida", "pumzi imekata", "napata shida ya kupumua"] },
  { id: "chest_pain", label: "chest pain or tightness", category: "Other health concern", phrases: ["chest pain", "chest tightness", "maumivu ya kifua", "kifua kinaniuma", "kifua inaniuma", "kifua inabana", "kubanwa kifua"] },
  { id: "loss_of_consciousness", label: "fainting or loss of consciousness", category: "Other health concern", phrases: ["passed out", "fainted", "unconscious", "nimezimia", "amezimia", "kupoteza fahamu", "amepoteza fahamu"] },
  { id: "seizure", label: "seizure or convulsion", category: "Other health concern", phrases: ["seizure", "convulsion", "degedege", "kifafa"] },
  { id: "severe_bleeding", label: "heavy bleeding", category: "Bleeding", phrases: ["heavy bleeding", "bleeding heavily", "damu nyingi sana", "natokwa damu nyingi", "natoa damu nyingi", "damu haikomi"] },
  { id: "pregnancy_bleeding", label: "bleeding during possible pregnancy", category: "Pregnancy-related concern", phrases: ["bleeding while pregnant", "pregnant and bleeding", "damu nikiwa mjamzito", "natokwa damu na mimba", "natoa damu nikiwa na mimba"] },
  { id: "reduced_fetal_movement", label: "reduced or absent fetal movement", category: "Pregnancy-related concern", phrases: ["baby not moving", "baby is not moving", "reduced baby movement", "baby moving less", "mtoto hachezi", "mtoto hasongi", "mtoto anacheza kidogo", "sihisi mtoto akisonga"] },
  { id: "fluid_leakage", label: "possible fluid leakage in pregnancy", category: "Pregnancy-related concern", phrases: ["water breaking", "waters have broken", "fluid leaking", "maji ya uzazi yanatoka", "maji inatoka ukeni", "ninatokwa na maji ukeni"] },
  { id: "lower_abdominal_pain", label: "lower abdominal or pelvic pain", category: "Lower abdominal pain", phrases: ["lower abdominal pain", "lower tummy pain", "lower stomach pain", "pelvic pain", "maumivu ya tumbo la chini", "tumbo inauma chini", "tumbo inaniuma chini", "maumivu ya nyonga", "chini ya tumbo inauma"] },
  { id: "vaginal_discharge", label: "vaginal discharge", category: "Vaginal discharge", phrases: ["vaginal discharge", "abnormal discharge", "discharge from vagina", "uchafu ukeni", "natoa uchafu ukeni", "natokwa na uchafu", "uchafu unatoka ukeni"] },
  { id: "abnormal_vaginal_bleeding", label: "vaginal bleeding or spotting", category: "Bleeding", phrases: ["vaginal bleeding", "spotting", "bleeding between periods", "natokwa damu ukeni", "natoa damu ukeni", "nimebleed", "damu inatoka ukeni", "madoadoa ya damu"] },
  { id: "menstrual_problem", label: "menstrual or period problem", category: "Menstrual problem", phrases: ["period problem", "irregular periods", "missed period", "heavy periods", "painful periods", "period imechelewa", "hedhi imechelewa", "hedhi haiji", "menses imechelewa", "maumivu ya hedhi"] },
  { id: "fever", label: "fever", category: null, phrases: ["fever", "high temperature", "homa", "mwili iko na joto", "mwili una joto"] },
  { id: "vomiting", label: "vomiting", category: null, phrases: ["vomiting", "throwing up", "ninatapika", "natapika", "kutapika"] },
  { id: "dysuria", label: "pain or burning when urinating", category: null, phrases: ["pain when urinating", "burning when urinating", "painful urination", "kuungua nikikojoa", "inauma nikikojoa", "maumivu wakati wa kukojoa"] },
  { id: "severe_pain", label: "severe pain", category: null, phrases: ["severe pain", "unbearable pain", "maumivu makali sana", "maumivu yasiyovumilika", "inauma vibaya sana"] },
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasPhrase = (text, phrase) => {
  const escaped = escapeRegex(phrase.toLocaleLowerCase("en"));
  const match = new RegExp("(^|\\b)" + escaped + "($|\\b)", "i").exec(text);
  return match ? match.index + match[1].length : -1;
};

const isNegated = (text, index) => {
  const before = text.slice(Math.max(0, index - 48), index);
  return /(?:^|\\s)(?:no|not|without|denies|don't have|do not have|doesn't have|does not have|sina|hakuna|sio)(?:\\s+[\\p{L}]+){0,2}\\s*$/iu.test(before);
};

/**
 * @returns {{ original: string, normalized_summary: string, symptoms: Array,
 *   suggested_category: string|null, category_confidence: "high"|"medium"|"none" }}
 */
export function interpretSymptomText(input) {
  const original = clean(input, 1200);
  const text = normalise(original);
  if (!text) return { original, normalized_summary: "", symptoms: [], suggested_category: null, category_confidence: "none" };

  const matches = phraseGroups.flatMap((group) => group.phrases
    .map((phrase) => ({ group, index: hasPhrase(text, phrase) }))
    .filter((match) => match.index >= 0)
    .map(({ group, index }) => ({ id: group.id, label: group.label, category: group.category, negated: isNegated(text, index) })));
  const symptoms = [...new Map(matches.map((item) => [item.id, item])).values()];
  const positiveSymptoms = symptoms.filter((item) => !item.negated);
  const categories = [...new Set(positiveSymptoms.map((item) => item.category).filter(Boolean))];
  const suggested_category = categories.length === 1 ? categories[0] : null;
  const category_confidence = !suggested_category ? "none"
    : positiveSymptoms.filter((item) => item.category === suggested_category).length > 1 ? "high" : "medium";

  return {
    original,
    normalized_summary: positiveSymptoms.map((item) => item.label).join("; "),
    symptoms,
    suggested_category,
    category_confidence,
  };
}
