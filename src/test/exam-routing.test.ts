import { describe, expect, it } from "vitest";
import { buildExamPath, extractIdFromParam } from "@/lib/store";

describe("exam start links", () => {
  const id = "d3a96479-aca5-4a76-82c5-dc79aa2b5dc4";

  it("can resolve weekly exams without a stored slug by their full ID", () => {
    const path = buildExamPath({ id, title: "Weekly Pathology Exam", slug: null });
    const param = path.split("/")[2];
    expect(extractIdFromParam(param)).toBe(id);
    expect(path).toBe(`/exams/${id}-weekly-pathology-exam/start`);
  });

  it("preserves stored slugs for lookup by slug", () => {
    expect(buildExamPath({ id, title: "Weekly Pathology Exam", slug: "pathology-week-1" }))
      .toBe("/exams/pathology-week-1/start");
  });
});
