export const SUPPLEMENTARY_GROUPS = [
  "Year 2 Microbiology",
  "Year 2 Parasitology",
  "Year 3 Bacteriology & Parasitology II",
  "Medical Virology",
  "Medical Mycology",
  "General Pathology",
  "Systemic Pathology",
  "Haematology",
] as const;

export type SupplementaryGroup = (typeof SUPPLEMENTARY_GROUPS)[number];

export const SUPPLEMENTARY_MATERIALS = ["Notes & revision guides", "Past papers", "CATs", "Essays & SAQs", "Question banks", "MCQs & timed exams", "Flashcards"] as const;
export type SupplementaryMaterial = (typeof SUPPLEMENTARY_MATERIALS)[number];
export type AnswerReadiness = "Study content" | "Answers included" | "Answer key complete";

export function classifySupplementaryMaterial(title: string, contentType?: string | null, examType?: string | null): SupplementaryMaterial {
  const text = `${title} ${contentType || ""} ${examType || ""}`;
  if (/\bcat\b/i.test(text)) return "CATs";
  if (/past paper|end[- ]?year|examination|\bexam\b/i.test(text)) return "Past papers";
  if (/\bmcq|quiz|question bank/i.test(text)) return "Question banks";
  if (/essay|saq|laq|short answer|long answer/i.test(text)) return "Essays & SAQs";
  return "Notes & revision guides";
}

const ANSWER_TEXT = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:model|suggested|correct)?\s*answers?\b|(?:^|\n)\s*(?:#{1,6}\s*)?(?:explanation|rationale|marking scheme)\b|\bcorrect answer\s*[:\-]/im;

function validMcqAnswer(question: unknown): boolean {
  if (!question || typeof question !== "object") return false;
  const q = question as { options?: unknown; correct_answer?: unknown; correctAnswer?: unknown; answer?: unknown };
  const options = Array.isArray(q.options) ? q.options : [];
  const answer = q.correct_answer ?? q.correctAnswer ?? q.answer;
  if (typeof answer === "number") return Number.isInteger(answer) && answer >= 0 && answer < options.length;
  if (typeof answer !== "string" || !answer.trim()) return false;
  const value = answer.trim();
  if (/^[A-Z]$/i.test(value)) return value.toUpperCase().charCodeAt(0) - 65 < options.length;
  return options.some((option) => typeof option === "string" && option.trim().toLowerCase() === value.toLowerCase());
}

/** Question resources are learner-visible only when their answers are structurally usable. */
export function assessAnswerReadiness(input: {
  kind: "article" | "exam" | "flashcard";
  material: SupplementaryMaterial;
  content?: string | null;
  items?: unknown;
  containsAnswerKey?: boolean | null;
  answerKeyVerified?: boolean | null;
}): { ready: boolean; label: AnswerReadiness | "Missing answers" } {
  if (input.kind === "article" && input.material === "Notes & revision guides") return { ready: true, label: "Study content" };
  if (input.kind === "article") {
    const ready = Boolean(input.containsAnswerKey || input.answerKeyVerified || ANSWER_TEXT.test(input.content || ""));
    return { ready, label: ready ? (input.answerKeyVerified ? "Answer key complete" : "Answers included") : "Missing answers" };
  }
  if (input.containsAnswerKey || input.answerKeyVerified) {
    return { ready: true, label: input.answerKeyVerified ? "Answer key complete" : "Answers included" };
  }
  if (!Array.isArray(input.items) || input.items.length === 0) return { ready: false, label: "Missing answers" };
  if (input.kind === "exam") {
    const ready = input.items.every(validMcqAnswer);
    return { ready, label: ready ? "Answer key complete" : "Missing answers" };
  }
  const ready = input.items.every((card) => Boolean(card && typeof card === "object" && typeof (card as { answer?: unknown }).answer === "string" && (card as { answer: string }).answer.trim()));
  return { ready, label: ready ? "Answer key complete" : "Missing answers" };
}

const SYSTEMIC_CATEGORIES = /(?:bone and soft tissue pathology|breast pathology|cardiovascular system pathology|dermatopathology|endocrine and metabolic pathology|female reproductive system pathology|gastrointestinal pathology|head\s*&\s*neck pathology|male reproductive and urinary system pathology|neuropathology|respiratory system pathology)/i;
const GENERAL_CATEGORIES = /(?:general pathology|immunopathology|oncopathology|histopathology\s*&\s*cytopathology)/i;
const HAEM_CATEGORIES = /(?:hematopathology|haematopathology|blood transfusion)/i;

/**
 * Category-first classification for the supplementary dashboard.
 * A disease word in a title must never override its assigned academic unit:
 * e.g. HIV nephropathy remains urinary-system pathology, and viral arthritis
 * remains bone/soft-tissue pathology. Titles are consulted only for genuinely
 * generic categories such as "Uncategorized" or "Weekly Exam: Pathology".
 */
export function classifySupplementaryResource(title: string, category: string): SupplementaryGroup | null {
  const c = (category || "").trim();
  const t = (title || "").trim();

  if (/^(?:Weekly Exam:\s*)?Year 2:\s*Microbiology$/i.test(c)) return "Year 2 Microbiology";
  if (/^(?:Weekly Exam:\s*)?Year 2:\s*Parasitology$/i.test(c)) return "Year 2 Parasitology";
  if (/^Year 3:\s*(?:Bacteriology|Parasitology)$/i.test(c)) return "Year 3 Bacteriology & Parasitology II";
  if (/^Year 3:\s*Medical Virology$/i.test(c)) return "Medical Virology";
  if (/^Year 3:\s*Medical Mycology$/i.test(c)) return "Medical Mycology";
  if (HAEM_CATEGORIES.test(c)) return "Haematology";
  if (SYSTEMIC_CATEGORIES.test(c)) return "Systemic Pathology";
  if (GENERAL_CATEGORIES.test(c)) {
    if (/systemic pathology/i.test(t)) return "Systemic Pathology";
    return "General Pathology";
  }

  const generic = /^(?:Uncategorized|Pathology|Weekly Exam:\s*Pathology)$/i.test(c);
  if (!generic) return null;
  if (/haemat|hemat|blood transfusion|anaemia|anemia|leuk|leuka|lymphoma|coagulation|haemostasis|hemostasis/i.test(t)) return "Haematology";
  if (/medical virology|virology\b/i.test(t)) return "Medical Virology";
  if (/medical mycology|mycology\b/i.test(t)) return "Medical Mycology";
  if (/parasitology\b/i.test(t)) return "Year 2 Parasitology";
  if (/microbiology\b/i.test(t)) return "Year 2 Microbiology";
  if (/bacteriology\b/i.test(t)) return "Year 3 Bacteriology & Parasitology II";
  if (/systemic pathology|cardiovascular pathology|respiratory pathology|gastrointestinal pathology|renal pathology|endocrine pathology|reproductive pathology|breast pathology|bone pathology|skin pathology|neuropathology/i.test(t)) return "Systemic Pathology";
  if (/general pathology|cell injury|inflammation|neoplas|tissue repair|wound healing/i.test(t) || /pathology/i.test(c)) return "General Pathology";
  return null;
}
