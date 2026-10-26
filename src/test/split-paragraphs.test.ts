import { describe, expect, it } from "vitest";
import { splitLongBlock, tidyHtml, tidyPlain } from "@/lib/tidyStory";

const sentence = (n: number) => `This is sentence number ${n} of a long story that has no paragraph breaks at all.`;
const block = Array.from({ length: 16 }, (_, i) => sentence(i + 1)).join(" ");

describe("auto paragraphs", () => {
  it("leaves a short block alone", () => {
    expect(splitLongBlock("One short paragraph. Two sentences.")).toHaveLength(1);
  });
  it("splits a long block into several readable paragraphs", () => {
    const parts = splitLongBlock(block);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.join(" ")).toBe(block);
    for (const p of parts) expect(p.split(" ").length).toBeGreaterThan(14);
  });
  it("applies to plain text and to story html", () => {
    expect(tidyPlain(block).split("\n\n").length).toBeGreaterThanOrEqual(2);
    const html = tidyHtml(`<p><em>By A. · Year 1</em></p><p>${block}</p>`);
    expect((html.match(/<p>/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(html).toContain("<em>By A. · Year 1</em>");
  });
});
