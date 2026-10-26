import { describe, expect, it } from "vitest";
import { aboutFromTags, aboutTag, authorFromContent, isVerifiedStory, withoutAuthorTags } from "@/lib/storyAuthor";

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
