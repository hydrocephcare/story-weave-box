const NON_STUDY_IMPORT_TITLE = /^(?:notice to all students\b|students handbook\b|executive order no\b)/i;
const QUARANTINED_MCQ_IDS = new Set([
  "6153459b-9da7-4d60-980f-674d5ca2580f",
  "125a6d66-b38f-45e6-a95e-380066bd5257",
  "aeaa1ce1-dc24-4aae-9a6a-11631a31d7b9",
  "7a7c3038-ab41-4a78-8148-a2284fc56672",
  "f15a9e45-c73c-48be-b912-98139710e62f",
  "017c0a74-a0bd-49a5-8a05-018ba7464800",
  "08dae484-5c64-43cb-84e9-947a7da6b0f9",
  "176b7eb4-4388-418a-bac0-d6493e719f58",
  "c6dee341-d765-465a-9c9d-087d7535f72e",
  "e5dc4145-d973-421a-b377-ff096e792230",
  "955cf260-6b59-4e13-aecb-f0f4626e7626",
  "0059385b-fcf6-4d1f-8773-b8da2ef15531",
  "3b4299c3-c369-4d47-b312-66fa5c88747c",
]);

/** Public discovery must contain study material, not accidental admin imports. */
export function isPublicStudyTitle(title: unknown): boolean {
  return !NON_STUDY_IMPORT_TITLE.test(String(title || "").trim());
}

/** Banks with systemic answer-key corruption stay inaccessible until rebuilt. */
export function isPublicMcqSet(set: { id?: unknown; title?: unknown }): boolean {
  if (QUARANTINED_MCQ_IDS.has(String(set?.id || ""))) return false;
  return !/^(?:parasitology examination mcqs|medical bacteriology and parasitology exam 2024\/2025 mcqs|endocrine and metabolic pathology mcqs|clinical chemistry mcqs\b|clinical pathology(?: mcqs)?\s+—\s+past paper questions)/i.test(String(set?.title || "").trim());
}

export function hasEssayContent(essay: { short_answer_questions?: unknown; long_answer_questions?: unknown }): boolean {
  const saqs = Array.isArray(essay?.short_answer_questions) ? essay.short_answer_questions : [];
  const laqs = Array.isArray(essay?.long_answer_questions) ? essay.long_answer_questions : [];
  return saqs.length + laqs.length > 0;
}

export function hasStoryContent(story: { content?: unknown }): boolean {
  return String(story?.content || "").trim().length >= 100;
}

export function dedupeResourceSummaries<T extends { title?: unknown; category?: unknown; exam_year?: unknown; slug?: unknown; updated_at?: unknown }>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const row of rows || []) {
    const key = [row.title, row.category, row.exam_year].map((value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ")).join("|");
    const previous = best.get(key);
    if (!previous) { best.set(key, row); continue; }
    const score = (value: T) => (String(value.slug || "").trim() ? 2 : 0) + (Date.parse(String(value.updated_at || "")) || 0) / 1e15;
    if (score(row) > score(previous)) best.set(key, row);
  }
  return [...best.values()];
}
