import { describe, expect, it } from "vitest";
import { inferArticleLayout, preprocessContent, splitInlineEssayParts } from "@/lib/blog-content";
import { mergeVisualSourceImages } from "@/lib/legacy-content";
import { parseSlideDeck } from "@/components/SlideDeck";

describe("multipart essay question layout", () => {
  it("classifies mixed and visual papers for their dedicated renderers", () => {
    expect(inferArticleLayout("Pathology MCQs, SAQs and LAQs", "Past Paper", "A. One\nB. Two")).toBe("mixed");
    expect(inferArticleLayout("Aponeurosis Limb Spot", "", "Question 150")).toBe("visual");
  });

  it("restores legacy spot images beside their matching questions", () => {
    const content = "# Atlas\n\n## Spot 1: Brain\nIdentify it.\n\n## Spot 2: Lung\nIdentify it.\n\n## Spot 3: Liver\nIdentify it.";
    const source = "## Original scans\n\n![Brain](https://cdn.example/1.jpg)\n\n![Lung](https://cdn.example/2.jpg)\n\n![Liver](https://cdn.example/3.jpg)";
    const merged = mergeVisualSourceImages(content, source);
    expect(merged).toContain("## Spot 1: Brain\n\n![Brain](https://cdn.example/1.jpg)");
    expect(merged).toContain("## Spot 2: Lung\n\n![Lung](https://cdn.example/2.jpg)");
    expect(parseSlideDeck(merged)?.slides).toHaveLength(3);
  });
  it("places inline bold essay parts on separate lines", () => {
    const input = '**(a) Briefly describe oxidative deamination. [5 marks] (b) State the sources of amino acids. [5 marks]**';
    expect(preprocessContent(input)).toBe(
      "(a) Briefly describe oxidative deamination. [5 marks]\n(b) State the sources of amino acids. [5 marks]",
    );
  });

  it("retains introductory text before multipart questions", () => {
    expect(splitInlineEssayParts("Question: (a) Define haemostasis. (b) Give two examples.")).toEqual([
      "Question:",
      "(a) Define haemostasis.",
      "(b) Give two examples.",
    ]);
  });

  it("does not split answer bullets, explanations, or image captions", () => {
    expect(splitInlineEssayParts("- (a) First answer point (b) supporting detail")).toBeNull();
    expect(splitInlineEssayParts("Explanation: (a) causes this while (b) causes that")).toBeNull();
    expect(splitInlineEssayParts("![Diagram showing (a) brain and (b) cord](image.jpg)")).toBeNull();
  });
});
