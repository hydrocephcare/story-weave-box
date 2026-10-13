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

import { dropEmptyLabels } from "../../api/_lib/blogPolishCore.js";
import { applyPolish } from "@/lib/blogPolish";

describe("an empty label", () => {
  it("is removed, and a filled one is kept", () => {
    expect(dropEmptyLabels("*Intro.*\n**In short:**\n\n## 1. Heart\n\nText.")).not.toContain("In short");
    expect(dropEmptyLabels("**In short:** the heart pumps blood.\n\n## 1. Heart")).toContain("the heart pumps blood");
  });
  it("is not shown on the page even when it was saved before", () => {
    const body = `*Intro.*\n**In short:**\n\n## 1. Heart\n\n${"The heart pumps blood. ".repeat(20)}`;
    const out = applyPolish({ id: "z1", title: "t", content: "old" }, { title: null, description: null, content: body, verdict: "keep", status: "done" });
    expect(out.content).not.toContain("In short");
    expect(out.content).toContain("The heart pumps blood");
  });
});
