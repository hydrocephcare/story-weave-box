import { describe, expect, it } from "vitest";
import { guideReply } from "@/lib/ompathAiGuide";
import { outlineRefFor } from "@/components/NoteOutlineBox";

describe("course outlines are easy to reach", () => {
  it("the AI sends the student to the outline and its official text", async () => {
    const r = await guideReply("course outline for psychiatry", null);
    expect(r?.links?.map((l) => l.href)).toContain("/course-outlines/psychiatry");
    expect(r?.links?.map((l) => l.href)).toContain("/course-outlines/psychiatry#course-outline");
  });
  it("asks which year when there is nothing to go on", async () => {
    const r = await guideReply("what is the syllabus", null);
    expect(r?.links?.[0].href).toBe("/course-outlines");
  });
  it("a note knows its place in the outline", () => {
    const r = outlineRefFor({ slug: "introduction-to-psychopharmacology", year: 4, unit: "Mental Health/Psychiatry" });
    expect(r?.outline.id).toBe("psychiatry");
    expect(r?.items.length).toBeGreaterThanOrEqual(8);
    const r2 = outlineRefFor({ slug: "dictionary-of-psychopathology", year: 4, unit: "Mental Health/Psychiatry" });
    expect(r2?.outline.id).toBe("psychiatry");
  });
});
