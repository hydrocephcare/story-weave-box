import { checkContent } from "../../supabase/functions/_shared/contentCheck.js";

/**
 * Independently checks a generated written medical paper before it can be published.
 * Groq writes the questions; Gemini checks the complete questions and model answers.
 */
export async function reviewEssayPaper({ unit, essays, env, reviewer = checkContent }) {
  const saqs = Array.isArray(essays?.saqs) ? essays.saqs : [];
  const laqs = Array.isArray(essays?.laqs) ? essays.laqs : [];
  if (saqs.length < 4 || laqs.length < 1) {
    return { validated: false, reason: "format", model: null, issues: [] };
  }

  const result = await reviewer({
    title: unit,
    kind: "medical written examination SAQs, LAQs and model answers",
    text: JSON.stringify({ saqs, laqs }),
    env,
    timeoutMs: 45000,
  });

  return {
    validated: result?.validated === true && Boolean(result?.model),
    model: result?.model || null,
    at: result?.at || null,
    issues: Array.isArray(result?.issues) ? result.issues : [],
  };
}
