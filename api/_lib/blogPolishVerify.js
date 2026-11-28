import { askModel } from "../../supabase/functions/_shared/topicAi.js";
import { checkContent } from "../../supabase/functions/_shared/contentCheck.js";
import { kindOf } from "./blogPolishCore.js";

const thinnessIssues = (text) => {
  if (kindOf(text) !== "note") return [];
  const source = String(text);
  const words = source.trim().split(/\s+/).filter(Boolean).length;
  const sections = (source.match(/^##\s+\d+\.\s+.+/gm) || []).length;
  const questions = (source.match(/^###\s+Question\s+\d+/gim) || []).length;
  if (words >= 750 && sections >= 8 && questions >= 8) return [];
  return [{ severity: "medium", where: "overall structure", problem: "The article does not meet the comprehensive-note standard: it needs at least 750 words, eight substantive numbered sections and eight taught practice questions.", fix: "Expand with topic-specific physiology, types/classification, mechanisms, clinical relevance, investigations and interpretation, management, pharmacology, complications and prevention where relevant; add eight answered practice questions." }];
};

export async function verifyBlogContent(article, candidate, env, { allowRepair = false, timeoutMs = 35000 } = {}) {
  const original = String(article?.content || "");
  const source = String(candidate ?? original).trim();
  if (!source) return { status: "held", content: null, model: null, at: new Date().toISOString(), issues: [{ severity: "high", where: "article", problem: "No article text was available to verify.", fix: "Retry after the article text is available." }] };

  const review = await checkContent({ title: article.title || "Medical education article", kind: "published medical education article",
    text: source, env, timeoutMs });
  const issues = [...(review.issues || []), ...thinnessIssues(source)];
  if (review.validated && issues.length === 0) {
    return { status: "passed", content: candidate == null ? null : source, model: review.model, at: new Date().toISOString(), issues: [] };
  }
  if (!allowRepair || !env.GROQ_API_KEYS || source.length > 24000) {
    return { status: "held", content: null, model: review.model, at: new Date().toISOString(), issues: issues.slice(0, 12) };
  }

  const prompt = [
    "You are the medical editor correcting a published medical education article. Groq writes; a separate Gemini model will independently verify your revision.",
    "Correct every issue listed below. Preserve all correct original facts, definitions, numbers, units, drug names, warnings, tables, headings and image/embed lines. Do not remove valid content.",
    "Expand thin areas into a genuinely comprehensive teaching article: explain relevant types/classification, mechanisms and physiology, clinical features, investigations and interpretation, management and pharmacology, contraindications, complications, follow-up and prevention.",
    "Adapt the structure to the actual topic. Do not force disease headings onto anatomy, physiology, pharmacology, pathology, microbiology, biochemistry or public-health topics.",
    "Write for both the general public and medical students. Begin with a clear plain-language explanation, then provide accurate technical depth. Define specialist terms and add a short clearly labelled hypothetical example where useful. Use British spelling.",
    "Never invent statistics, references, local guidelines or drug doses. If a detail is uncertain, qualify it or omit it.",
    "The finished article should have at least 8 substantive topic-specific sections, meaningful explanations rather than one-line bullets, and useful tables where comparisons help.",
    "Keep all original image markdown and URLs unchanged. Do not claim that a doctor has reviewed the article.",
    "ISSUES TO CORRECT:",
    issues.map((x, i) => (i + 1) + ". [" + x.severity + "] " + x.where + ": " + x.problem + " | Required correction: " + x.fix).join("\n"),
    "ARTICLE TITLE: " + (article.title || "Medical education article"),
    "CATEGORY: " + (article.category || "Medical education"),
    "ARTICLE:",
    source,
    "Output only the complete corrected Markdown."
  ].join("\n\n");

  const repaired = await askModel(prompt, { env, plain: true,
    timeoutMs: Math.max(timeoutMs, 50000), maxTokens: 11000 });
  const corrected = String(repaired.text || "").trim();
  if (!corrected || corrected.length < Math.min(500, source.length * 0.65)) {
    return { status: "held", content: null, model: review.model, at: new Date().toISOString(), issues: issues.slice(0, 12) };
  }

  const second = await checkContent({ title: article.title || "Medical education article", kind: "published medical education article",
    text: corrected, env: { GEMINI_API_KEYS: env.GEMINI_API_KEYS }, timeoutMs });
  const remaining = [...(second.issues || []), ...thinnessIssues(corrected)];
  if (!second.validated || remaining.length) {
    return { status: "held", content: null, model: second.model || review.model, at: new Date().toISOString(), issues: remaining.slice(0, 12) };
  }
  return { status: "passed", content: corrected, model: second.model || review.model, at: new Date().toISOString(), issues: [] };
}
