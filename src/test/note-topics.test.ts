import { describe, expect, it } from "vitest";
import { groupByTopic, outlineForUnit } from "@/lib/noteTopics";

describe("notes under the topics of a unit's outline", () => {
  const outline = outlineForUnit("Year 4: Surgery")!;
  it("finds the Surgery outline for a Year 4 Surgery category", () => { expect(outline).toBeTruthy(); expect(outlineForUnit("Year 4: Nothing Here")).toBeNull(); });
  it("sorts notes into topics and keeps the rest together", () => {
    const g = groupByTopic([
      { title: "Oesophageal Cancer: Dysphagia, Staging, Oesophagectomy and Palliation" },
      { title: "Gastric Cancer: Presentation, Staging and Gastrectomy" },
      { title: "Acute Abdomen and Appendicitis Notes" },
      { title: "Introduction to Surgery" },
      { title: "Completely unrelated page" },
    ], outline);
    const where = (t: string) => g.find((x) => x.items.some((i) => i.title === t))?.title;
    expect(where("Acute Abdomen and Appendicitis Notes")).toBe("Appendix");
    expect(where("Introduction to Surgery")).toBe("Introduction to surgery");
    expect(where("Oesophageal Cancer: Dysphagia, Staging, Oesophagectomy and Palliation")).toBe("Oesophagus");
    expect(g[g.length - 1].id).toBe("other");
  });
});
