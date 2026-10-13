import { describe, expect, it } from "vitest";
import { restorePictures } from "../../api/_lib/blogPolishCore.js";

describe("restorePictures", () => {
  const pic = "![Kidney](https://example.com/kidney.png)";
  const original = `## Anatomy\n\nText one about the kidney.\n\n${pic}\n\n## Physiology\n\nText two about filtration.`;

  it("puts a dropped picture back", () => {
    const out = restorePictures(original, "## 1. Anatomy\n\nText one about the kidney.\n\n## 2. Physiology\n\nText two about filtration.");
    expect(out).toContain(pic);
    expect(out.indexOf(pic)).toBeGreaterThan(out.indexOf("Text one"));
  });

  it("leaves the text alone when every picture is there", () => {
    expect(restorePictures(original, original)).toBe(original);
  });
});
