import { describe, expect, it } from "vitest";
import { clean } from "../../scripts/maintenance/clean.mjs";

describe("note cleaner (scripts/maintenance/clean.mjs)", () => {
  it("separates answers glued onto the end of an option line", () => {
    const out = clean("- D) 9:3:3:1**Answer: A) 1:2:1****Explanation: The ratio is 1:2:1.\n");
    expect(out).toContain("**Answer: A) 1:2:1**");
    expect(out).toContain("**Explanation:** The ratio is 1:2:1.");
    expect(out).not.toContain("****");
  });

  it("puts glued options on their own lines", () => {
    const out = clean("**1.** Which is a vector?A. FleaB. TickC. LouseD. Mite\n\n**Correct answer:** B. Tick\n");
    expect(out).toMatch(/A\. Flea\nB\. Tick\nC\. Louse\nD\. Mite/);
  });

  it("removes scan residue and joins wrapped lines", () => {
    const out = clean("Visual or intentionally blank source page; see the attached original image.\n\nThe heart pumps blood to all parts of the\nbody through the aorta, and the blood\nreturns to the heart by the veins.\n");
    expect(out).not.toMatch(/intentionally blank/);
    expect(out).toContain("The heart pumps blood to all parts of the body through the aorta, and the blood returns to the heart by the veins.");
  });

  it("leaves a clean note alone", () => {
    const note = "# Title\n\n- one\n- two\n\n**1. Question?**\n\nA. x\nB. y\n\n**Answer: A.** because.\n";
    expect(clean(note)).toBe(note);
  });
});
