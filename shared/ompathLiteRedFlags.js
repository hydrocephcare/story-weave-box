const clean = (value, max = 1200) => String(value ?? "").replace(/[<>]/g, "").trim().slice(0, max);

const patterns = [
  ["severe_breathing_difficulty", /\b(?:cannot breathe|can't breathe|unable to breathe|shortness of breath|short of breath|gasping for air|breathless|severe(?:ly)? difficult(?:y)? breathing|struggling to breathe|siwezi kupumua|nashindwa kupumua|kupumua kwa shida sana|napumua kwa shida sana|pumzi imekata)\b/i],
  ["chest_pain", /\b(?:chest pain|crushing chest pain|chest tightness|maumivu (?:makali )?ya kifua|kubanwa kifua)\b/i],
  ["loss_of_consciousness", /\b(?:unconscious|passed out|fainted|not waking up|kupoteza fahamu|amepoteza fahamu|kuzimia)\b/i],
  ["near_syncope", /\b(?:feel faint|feeling faint|about to faint|nearly fainted|nearly passed out|lightheaded with (?:heavy )?bleeding|nahisi kuzimia|karibu kuzimia)\b/i],
  ["seizure", /\b(?:seizure|convulsion|fitting|degedege|kifafa)\b/i],
  ["severe_bleeding", /\b(?:heavy bleeding|bleeding heavily|bleeding won't stop|uncontrolled bleeding|soaking (?:a )?pad in an hour|one pad (?:per|an) hour|a pad every hour|damu nyingi sana|kutokwa damu nyingi|damu haikomi)\b/i],
  ["severe_pain", /\b(?:unbearable pain|worst pain|severe sudden pain|severe (?:abdominal|stomach|head|pelvic) pain|maumivu makali sana|maumivu makali ya (?:tumbo|kichwa|nyonga)|maumivu yasiyovumilika)\b/i],
  ["severe_allergic_reaction", /\b(?:throat closing|tongue swelling|swollen tongue|face swelling with breathing|koo linafunga|ulimi kuvimba na kupumua)\b/i],
  ["visual_disturbance", /\b(?:blurred vision|visual changes|flashing lights|seeing spots|loss of vision|vision loss|kuona ukungu|kuona miale ya mwanga)\b/i],
  ["severe_headache_or_visual_symptoms", /\b(?:sudden severe headache|worst headache|severe headache|kuumwa kichwa sana ghafla)\b/i],
  ["severe_epigastric_or_upper_abdominal_pain", /\b(?:severe (?:upper abdominal|epigastric|right upper quadrant) pain|severe pain under (?:the )?ribs|maumivu makali upande wa juu wa tumbo)\b/i],
  ["stroke_signs", /\b(?:face drooping|one[- ]sided weakness|slurred speech|sudden weakness on one side|uso kupinda|mkono mmoja kuwa dhaifu|maneno kutatizika)\b/i],
  ["poisoning_or_overdose", /\b(?:swallowed poison|drank poison|overdose|taken an overdose|nimekunywa sumu|amekunywa sumu)\b/i],
  ["suicidal_immediate_danger", /\b(?:about to kill myself|going to kill myself|taken poison to die|nimekunywa sumu ili kufa|nataka kujiua sasa)\b/i],
];

function isNegated(text, index) {
  const before = text.slice(Math.max(0, index - 56), index);
  return /(?:\b(?:do not have|don't have|does not have|doesn't have|do not feel|don't feel|not feeling|not experiencing|no sign of)\b(?:\s+\w+){0,3}\s*$|\b(?:no|not|without|denies|sina|hakuna|sio|si)\s*(?:any\s+)?(?:severe\s+)?$)/i.test(before);
}

export function detectEmergencyLanguage(input) {
  const text = clean(input).toLowerCase();
  if (!text) return [];
  return patterns.flatMap(([rule, regex]) => {
    const matcher = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
    let match;
    while ((match = matcher.exec(text)) !== null) {
      if (!isNegated(text, match.index)) return [{ rule, positive: true, evidence: match[0] }];
    }
    return [];
  });
}
