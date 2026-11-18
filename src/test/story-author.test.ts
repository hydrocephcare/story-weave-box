import { describe, expect, it } from "vitest";
import { aboutFromTags, aboutTag, authorFromContent, authorFromTags, authorTag, isVerifiedStory, withoutAuthorTags } from "@/lib/storyAuthor";

describe("story author", () => {
  it("round-trips the about note through a tag", () => {
    const tag = aboutTag("  Final-year MBChB at MKU. I love paediatrics & tea!  ");
    expect(aboutFromTags(["year-7", tag])).toBe("Final-year MBChB at MKU. I love paediatrics & tea!");
    expect(withoutAuthorTags(["year-7", tag])).toEqual(["year-7"]);
  });
  it("reads the byline", () => {
    expect(authorFromContent("<p><em>By Amina W. · Finalist</em></p><p>Hello</p>")).toEqual({ name: "Amina W.", level: "Finalist" });
    expect(authorFromContent("<p>No byline</p>")).toBeNull();
  });
  it("knows a verified story", () => {
    expect(isVerifiedStory(["student", "verified"])).toBe(true);
    expect(isVerifiedStory(["student"])).toBe(false);
  });
});
  it("round-trips compact author metadata for story cards", () => {
    const tag = authorTag("Amina W. Kamau", "Year 4");
    expect(authorFromTags(["year-4", tag])).toEqual({ name: "Amina W. Kamau", level: "Year 4" });
    expect(withoutAuthorTags(["year-4", tag])).toEqual(["year-4"]);
    expect(authorTag("A medical student", "Year 2")).toBe("");
  });

