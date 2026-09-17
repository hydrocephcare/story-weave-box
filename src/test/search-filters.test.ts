import { describe, expect, it } from "vitest";
import { groupHits, parseYearNumber, SEARCH_GROUPS, type SearchHit } from "@/lib/search";
import { dedupeResourceSummaries, hasEssayContent, hasStoryContent, isPublicMcqSet, isPublicStudyTitle } from "@/lib/content-policy";

describe("public content policy", () => {
  it("quarantines accidental administrative imports but keeps real study papers", () => {
    expect(isPublicStudyTitle("NOTICE TO ALL STUDENTS 75% Class attendance — Past Paper")).toBe(false);
    expect(isPublicStudyTitle("Students Handbook, 2019 Edition — Past Paper")).toBe(false);
    expect(isPublicStudyTitle("General Pathology CAT 2019")).toBe(true);
  });
  it("quarantines empty essay containers", () => {
    expect(hasEssayContent({ short_answer_questions: [], long_answer_questions: [] })).toBe(false);
    expect(hasEssayContent({ short_answer_questions: [{ question: "Define shock" }], long_answer_questions: [] })).toBe(true);
  });
  it("quarantines empty story shells", () => {
    expect(hasStoryContent({ content: "" })).toBe(false);
    expect(hasStoryContent({ content: "A complete clinical narrative. ".repeat(8) })).toBe(true);
  });
  it("quarantines a bank with systemic answer-key corruption", () => {
    expect(isPublicMcqSet({ id: "7fd6b778-ec52-4e41-ac34-ee69a7bbe68d", title: "Dr. Orata Haematology: 108 Past-Paper MCQs" })).toBe(true);
    expect(isPublicMcqSet({ id: "6153459b-9da7-4d60-980f-674d5ca2580f", title: "Parasitology Examination MCQs" })).toBe(false);
    expect(isPublicMcqSet({ id: "125a6d66-b38f-45e6-a95e-380066bd5257", title: "Medical Bacteriology and Parasitology Exam 2024/2025 MCQs" })).toBe(false);
    expect(isPublicMcqSet({ id: "aeaa1ce1-dc24-4aae-9a6a-11631a31d7b9", title: "Endocrine and Metabolic Pathology MCQs" })).toBe(false);
    expect(isPublicMcqSet({ id: "f15a9e45-c73c-48be-b912-98139710e62f", title: "CLINICAL CHEMISTRY MCQS LATEST — Past Paper Questions & Answers" })).toBe(false);
    expect(isPublicMcqSet({ id: "176b7eb4-4388-418a-bac0-d6493e719f58", title: "clinical pathology — Past Paper Questions & Answers" })).toBe(false);
    expect(isPublicMcqSet({ id: "e5dc4145-d973-421a-b377-ff096e792230", title: "Lower Limb Anatomy MCQ Compilation" })).toBe(false);
    expect(isPublicMcqSet({ id: "955cf260-6b59-4e13-aecb-f0f4626e7626", title: "MICROBIOLOGY AND PARASITOLOGY MCQs" })).toBe(false);
    expect(isPublicMcqSet({ id: "0059385b-fcf6-4d1f-8773-b8da2ef15531", title: "Chemical Pathology" })).toBe(false);
    expect(isPublicMcqSet({ id: "3b4299c3-c369-4d47-b312-66fa5c88747c", title: "Clinical Techniques Adobe Scan 22 Apr 2022 1 — Past Paper Questions & Answers" })).toBe(false);
    expect(isPublicMcqSet({ id: "safe", title: "Verified Haematology MCQs" })).toBe(true);
  });
  it("keeps one canonical resource when legacy imports duplicated a set", () => {
    const rows = dedupeResourceSummaries([
      { title: "Parasitology Examination", category: "Year 2: Parasitology", slug: null },
      { title: "Parasitology Examination", category: "Year 2: Parasitology", slug: "parasitology-examination" },
      { title: "Parasitology Examination", category: "Year 3: Parasitology", slug: "year-3-parasitology" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].slug).toBe("parasitology-examination");
  });
});

describe("parseYearNumber", () => {
  it("accepts a plain number", () => {
    expect(parseYearNumber(2)).toBe(2);
  });
  it("accepts a bare numeric string", () => {
    expect(parseYearNumber("3")).toBe(3);
  });
  it("extracts the number out of a 'Year N' label", () => {
    expect(parseYearNumber("Year 4")).toBe(4);
  });
  it("returns null for empty/undefined input instead of matching everything", () => {
    expect(parseYearNumber(undefined)).toBeNull();
    expect(parseYearNumber("")).toBeNull();
  });
});

function hit(overrides: Partial<SearchHit>): SearchHit {
  return {
    id: overrides.id ?? "1",
    title: overrides.title ?? "Sample",
    slug: overrides.slug ?? "sample",
    category: overrides.category ?? "Year 1: Anatomy",
    kind: overrides.kind ?? "article",
    contentType: overrides.contentType ?? "Notes",
    reason: overrides.reason ?? "Matched title",
    href: overrides.href ?? "/blog/sample",
    score: overrides.score ?? 50,
    ...overrides,
  };
}

describe("groupHits", () => {
  it("promotes the first article/Notes hit to Best Explanation and never duplicates it", () => {
    const notes = hit({ id: "notes-1", contentType: "Notes", kind: "article" });
    const mcq = hit({ id: "mcq-1", contentType: "MCQ Bank", kind: "mcq" });
    const grouped = groupHits([notes, mcq]);
    expect(grouped["Best Explanation"]).toEqual([notes]);
    expect(grouped["Notes"]).toBeUndefined();
    expect(grouped["MCQ Bank"]).toEqual([mcq]);
  });

  it("folds Revision Guide and Course Outline content types into Notes", () => {
    const guide = hit({ id: "g1", contentType: "Revision Guide" });
    const outline = hit({ id: "o1", contentType: "Course Outline" });
    const grouped = groupHits([guide, outline]);
    expect(grouped["Notes"]).toEqual([guide, outline]);
  });

  it("only every group key is one of the known SEARCH_GROUPS (plus Best Explanation)", () => {
    const grouped = groupHits([hit({ contentType: "Flashcards", kind: "flashcard" })]);
    for (const key of Object.keys(grouped)) {
      expect([...SEARCH_GROUPS, "Best Explanation"]).toContain(key);
    }
  });
});
