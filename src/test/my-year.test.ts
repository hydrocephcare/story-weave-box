import { describe, expect, it } from "vitest";
import { yearOfCategory } from "@/hooks/useMyYear";

describe("which year a note or exam is for", () => {
  it("reads the year from the category", () => {
    expect(yearOfCategory("Year 4: Internal Medicine")).toBe(4);
    expect(yearOfCategory("Year 3 · Medical Mycology")).toBe(3);
    expect(yearOfCategory("year 1")).toBe(1);
  });
  it("returns null when it is for everyone", () => {
    expect(yearOfCategory("Weekly Exam: Cardiology")).toBeNull();
    expect(yearOfCategory("Stories")).toBeNull();
    expect(yearOfCategory(null)).toBeNull();
    expect(yearOfCategory("Year 9")).toBeNull();
  });
});
