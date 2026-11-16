export type ResourceSeoKind = "MCQs" | "Flashcards";

export function resourceSeoTitle(
  rawTitle: string | null | undefined,
  rawSlug: string | null | undefined,
  category: string | null | undefined,
  kind: ResourceSeoKind,
): string {
  const base = String(rawTitle || "Medical revision")
    .replace(/\s*[|–—-]\s*Ompath\s*Study(?:\s*Kenya)?\s*$/i, "")
    .replace(/\s*(?:[|:–—-]\s*)?(?:MCQs?|Flashcards?)\s*$/i, "")
    .replace(/\s*(?:[|:–—-]\s*)?(?:MCQs?|Flashcards?)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim() || "Medical revision";
  const slugify = (value: string) => value.toLowerCase().trim().replace(/&/g, " and ").replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const baseTokens = slugify(base).split("-").filter(Boolean);
  const excluded = new Set(["mcq", "mcqs", "quiz", "questions", "flashcard", "flashcards", "and", "the", "for", "of", "in", "on", "to", "set"]);
  const extras = String(rawSlug || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).filter((token) => !baseTokens.includes(token) && !excluded.has(token));
  const rawCategory = String(category || "").trim();
  const year = rawCategory.match(/^Year\s*([1-6])\s*:?\s*(.*)$/i);
  const categoryLabel = year ? `Y${year[1]} ${year[2]}`.trim() : rawCategory;
  const descriptor = (extras.length ? `Set ${extras.join(" ")}` : categoryLabel || "Revision").slice(0, 18);
  const shortBase = base.length > 32 ? base.slice(0, 32).replace(/\s+\S*$/, "") : base;
  return `${shortBase} (${descriptor}) ${kind} | Ompath Study`;
}
