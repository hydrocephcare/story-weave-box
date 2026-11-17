const clean = (value, max = 1200) => String(value ?? "").replace(/[<>]/g, "").trim().slice(0, max);
const patterns = [
  ["severe_breathing_difficulty", /\b(?:cannot breathe|can't breathe|unable to breathe|shortness of breath|breathless|severe(?:ly)? difficult(?:y)? breathing|struggling to breathe|siwezi kupumua|nashindwa kupumua|kupumua kwa shida sana|napumua kwa shida sana|pumzi imekata)\b/i],
  ["chest_pain", /\b(?:chest pain|crushing chest pain|chest tightness|maumivu ya kifua|kubanwa kifua)\b/i],
  ["loss_of_consciousness", /\b(?:unconscious|passed out|fainted|not waking up|kupoteza fahamu|amepoteza fahamu|kuzimia)\b/i],
  ["seizure", /\b(?:seizure|convulsion|fitting|degedege|kifafa)\b/i],
  ["severe_bleeding", /\b(?:heavy bleeding|bleeding heavily|bleeding won't stop|uncontrolled bleeding|soaking (?:a )?pad in an hour|damu nyingi sana|kutokwa damu nyingi|damu haikomi)\b/i],
  ["severe_pain", /\b(?:unbearable pain|worst pain|severe sudden pain|severe (?:abdominal|stomach|head|pelvic) pain|maumivu makali sana|maumivu makali ya (?:tumbo|kichwa|nyonga)|maumivu yasiyovumilika)\b/i],
  ["severe_allergic_reaction", /\b(?:throat closing|tongue swelling|swollen tongue|face swelling with breathing|koo linafunga|ulimi kuvimba na kupumua)\b/i],
  ["suicidal_immediate_danger", /\b(?:about to kill myself|going to kill myself|taken poison to die|nimekunywa sumu ili kufa|nataka kujiua sasa)\b/i],
];

function isNegated(text, index) {
  const before = text.slice(Math.max(0, index - 48), index);
  return /(?:\b(?:do not have|don't have|does not have|doesn't have|not experiencing|no sign of)\s*$|\b(?:no|not|without|denies|sina|hakuna|sio|si)\s*(?:any\s+)?(?:severe\s+)?$)/i.test(before);
}

export function detectEmergencyLanguage(input) {
  const text = clean(input).toLowerCase();
  if (!text) return [];
  return patterns.flatMap(([rule, regex]) => {
    const match = regex.exec(text);
    return match && !isNegated(text, match.index)
      ? [{ rule, positive: true, evidence: match[0] }]
      : [];
  });
}

const ANSWER_LABELS = {
  "1": "Yes",
  "2": "No",
  "3": "Not sure",
  "4": "Not sure",
};
function labelAnswer(questionId, answer) {
  const value = String(answer);
  if (questionId === "gestation") return ({ "1": "Under 20 weeks", "2": "20-27 weeks", "3": "28 weeks or more", "4": "Not sure" })[value] || "Not sure";
  if (["duration", "onset"].includes(questionId)) return ({ "1": "Less than 1 day / Today", "2": "1-7 days", "3": "More than 7 days" })[value] || "Not sure";
  return ANSWER_LABELS[value] || clean(answer, 30);
}

/**
 * Builds a conservative, rule-based intake summary. It deliberately does not
 * generate diagnoses or treatment plans. Clinical urgency is raised only by
 * explicit high-risk answers; uncertainty defaults to in-person assessment.
 */
export function buildPreliminaryAssessment({ encounter, answers = [], emergencyFlags = [] } = {}) {
  const category = clean(encounter?.concern_category, 100) || "Unspecified concern";
  const original = clean(encounter?.original_message, 1200);
  const mapped = answers.slice(0, 5).map((item) => ({
    question: clean(item.question_id, 60),
    answer: labelAnswer(item.question_id, item.answer),
  }));

  const answerFor = (id) => String(answers.find((item) => item.question_id === id)?.answer || "");
  const positive = (id) => answerFor(id) === "1";

  let urgency = "prompt";
  const reasons = [];
  if (emergencyFlags.length || positive("emergency_screen")) {
    urgency = "emergency";
    reasons.push("A possible emergency warning sign was reported.");
  } else if (answerFor("emergency_screen") === "3") {
    urgency = "urgent";
    reasons.push("The emergency screening answer was uncertain; urgent in-person assessment is the safer next step.");
  } else if (
    category === "Pregnancy-related concern" &&
    (positive("pregnancy_bleeding_or_fluid") || positive("pregnancy_movement")) &&
    ["1", "3"].includes(answerFor("pregnancy_status"))
  ) {
    urgency = "urgent";
    reasons.push("Bleeding, fluid leakage or reduced fetal movement with confirmed or possible pregnancy needs urgent maternity assessment.");
  } else if (
    category === "Bleeding" &&
    (positive("bleeding_amount") || ["1", "3"].includes(answerFor("pregnancy_possibility")))
  ) {
    urgency = "urgent";
    reasons.push("The reported bleeding pattern or possible pregnancy warrants urgent in-person assessment.");
  } else if (
    category === "Lower abdominal pain" &&
    ["1", "3"].includes(answerFor("pregnancy_possibility"))
  ) {
    urgency = "urgent";
    reasons.push("Lower abdominal pain with possible pregnancy needs urgent assessment to exclude time-critical causes.");
  } else if (
    category === "Lower abdominal pain" &&
    positive("fever_vomiting")
  ) {
    urgency = "urgent";
    reasons.push("Lower abdominal pain with fever or repeated vomiting needs urgent in-person assessment.");
  } else if (
    category === "Bleeding" &&
    positive("pain")
  ) {
    urgency = "urgent";
    reasons.push("Bleeding with significant abdominal or pelvic pain needs urgent in-person assessment.");
  } else if (
    (category === "Vaginal discharge" || category === "Menstrual problem") &&
    positive("fever")
  ) {
    urgency = "urgent";
    reasons.push("Fever accompanying a genital or menstrual concern needs same-day clinical assessment.");
  } else {
    reasons.push("The available information is insufficient to establish a cause.");
  }

  if (mapped.some((item) => item.answer === "Not sure")) {
    reasons.push("One or more answers were uncertain; this limits interpretation.");
  }

  const nextSteps = urgency === "emergency"
    ? ["Seek emergency medical care now. Do not wait for an SMS or online assessment."]
    : urgency === "urgent"
      ? ["Attend a health facility urgently today for in-person assessment.", "If symptoms become severe, seek emergency care immediately."]
      : ["Arrange an in-person assessment at a health facility, preferably promptly.", "Seek emergency care immediately if severe pain, heavy bleeding, fainting, seizures or breathing difficulty develops."];

  return {
    assessment_type: "preliminary_intake_summary",
    generated_at: new Date().toISOString(),
    status: "not_a_diagnosis",
    concern_category: category,
    presenting_concern: original || null,
    clarification_answers: mapped,
    urgency_level: urgency,
    reasons,
    possible_causes: [],
    clinical_examination: "Not performed",
    investigations: "Not performed",
    limitations: [
      "This is an automated intake summary, not a diagnosis or a substitute for examination by a qualified health professional.",
      "No physical examination, vital signs, pregnancy test or investigations were available.",
      "A negative emergency screen does not rule out a serious condition.",
    ],
    next_steps: nextSteps,
    source_policy: "No unreviewed study notes or unsupported diagnostic claims were used.",
  };
}
