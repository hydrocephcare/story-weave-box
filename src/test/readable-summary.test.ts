import { describe, expect, it } from "vitest";
import { readableSummary } from "@/lib/seo";

describe("readableSummary (the grey line under a note's title)", () => {
  it("uses a clean stored description", () => {
    expect(readableSummary("Short-answer physiology questions with model answers for first-year students.", "# x", 140)).toMatch(/^Short-answer physiology/);
  });

  it("skips markdown headings and printed paper headers when the description is raw", () => {
    const content = "#### SCHOOL OF MEDICINE DEPARTMENT OF MEDICAL PHYSIOLOGY\n\n### INSTRUCTIONS:\n\n- This paper contains two sections.\n\nThis paper tests the renal and cardiovascular physiology taught in the second semester of the course.\n";
    const out = readableSummary("#### SCHOOL OF MEDICINE — — ### INSTRUCTIONS: - This paper", content, 140);
    expect(out).toMatch(/^This paper tests the renal/);
    expect(out).not.toMatch(/#|SCHOOL OF MEDICINE/);
  });

  it("falls back to the first real paragraph", () => {
    const out = readableSummary(undefined, "## Introduction\n\nMalaria is a life-threatening disease caused by protozoan parasites of the genus Plasmodium.\n", 80);
    expect(out.startsWith("Malaria is a life-threatening disease")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(80);
  });
});
