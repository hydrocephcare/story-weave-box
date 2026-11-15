import { describe, expect, it } from "vitest";
import { folderMeta, isIndexableFolder } from "@/lib/libraryMeta";

const registry = {
  siteUrl: "https://www.ompathstudy.com",
  brand: "Ompath Study",
  credit: "Compiled by Ompath Study",
  seoCredit: "Compiled by Ompath Study",
  audience: "MBChB students at Mount Kenya University and other universities",
};
const year1 = {
  year: 1,
  slug: "year-1",
  label: "Year 1",
  dataFile: "year1-library.json",
  title: "Year 1 Notes Library",
  tagline: "Anatomy, Physiology, Biochemistry & Behavioural Sciences",
  rootLabel: "subjects",
  theme: 168,
};

describe("library folder SEO", () => {
  it("keeps titles and descriptions within search snippet limits", () => {
    const chain = [
      { n: "Anatomy", s: "anatomy", d: [] },
      { n: "Gross Anatomy", s: "gross-anatomy", d: [] },
      { n: "Textbooks & Reference", s: "textbooks-and-reference", d: [] },
    ];
    const meta = folderMeta(registry, year1, chain, 100);
    expect(meta.title.length).toBeLessThanOrEqual(60);
    expect(meta.description.length).toBeLessThanOrEqual(160);
    expect(meta.title).toContain("Textbooks & Reference");
  });

  it("keeps year and subject hubs indexable but excludes thin deep folders", () => {
    expect(isIndexableFolder([], 1000)).toBe(true);
    expect(isIndexableFolder([{ n: "Anatomy", s: "anatomy" }], 100)).toBe(true);
    expect(isIndexableFolder([{ n: "Anatomy", s: "anatomy" }, { n: "One file", s: "one-file" }], 1)).toBe(false);
    expect(isIndexableFolder([{ n: "Anatomy", s: "anatomy" }, { n: "Gross Anatomy", s: "gross-anatomy" }], 3)).toBe(true);
  });
});
