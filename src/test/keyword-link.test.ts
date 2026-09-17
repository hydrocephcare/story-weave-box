import { describe, expect, it } from "vitest";
import { isUsefulTerm, stripCatalogLabel } from "@/lib/keyword-link";

describe("keyword-link catalogue labels", () => {
  it("removes article-type suffixes", () => {
    expect(stripCatalogLabel("Malaria and Plasmodium — Notes")).toBe("Malaria and Plasmodium");
    expect(stripCatalogLabel("General Pathology — MCQ Bank")).toBe("General Pathology");
    expect(stripCatalogLabel("Pathology Assessment — CAT 2025")).toBe("Pathology Assessment");
    expect(stripCatalogLabel("Bacteriology — Past Paper 2024/2025")).toBe("Bacteriology");
  });
  it("preserves medical punctuation", () => {
    expect(stripCatalogLabel("Adrenal Adenoma vs Carcinoma: Diagnostic Criteria")).toBe("Adrenal Adenoma vs Carcinoma: Diagnostic Criteria");
  });
  it("keeps medical concepts and rejects ordinary connector words", () => {
    expect(isUsefulTerm("malaria")).toBe(true);
    expect(isUsefulTerm("inflammation")).toBe(true);
    expect(isUsefulTerm("glomerulonephritis")).toBe(true);
    expect(isUsefulTerm("and")).toBe(false);
    expect(isUsefulTerm("another")).toBe(false);
    expect(isUsefulTerm("general")).toBe(false);
  });
});
