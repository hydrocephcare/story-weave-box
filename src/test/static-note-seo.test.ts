import { describe, expect, it } from "vitest";
import { buildStaticNoteMeta } from "@/lib/seo";

describe("static note SEO metadata", () => {
  it("keeps the AUB page title and description within search snippet limits", () => {
    const meta = buildStaticNoteMeta({
      title: "Abnormal Uterine Bleeding (AUB)",
      year: 4,
      unit: "Obstetrics & Gynaecology",
      description: "A comprehensive Year 4 guide to the definition, FIGO PALM–COEIN classification, clinical assessment, investigations and evidence-based management of abnormal uterine bleeding.",
    });
    expect(meta.title).toBe("Abnormal Uterine Bleeding (AUB) | Year 4 O&G Notes");
    expect(meta.title.length).toBeLessThanOrEqual(60);
    expect(meta.description.length).toBeLessThanOrEqual(160);
    expect(meta.description).toContain("FIGO PALM–COEIN");
  });

  it("uses a safe fallback for other long unit labels and titles", () => {
    const meta = buildStaticNoteMeta({
      title: "A very long clinical topic title that exceeds the normal display length",
      year: 4,
      unit: "Internal Medicine",
      description: "A useful description.",
    });
    expect(meta.title.length).toBeLessThanOrEqual(60);
    expect(meta.description).toBe("A useful description.");
  });
});
