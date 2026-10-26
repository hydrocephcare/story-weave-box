import { describe, expect, it } from "vitest";
import { cleanExtra, extraFromTags, extraTag, ownerOf, withoutExtraTag } from "@/lib/storyExtras";

describe("story extras", () => {
  it("keeps good values and drops bad ones", () => {
    const c = cleanExtra({ cls: "2026", ints: ["Paediatrics", "Surgery", "Research", "Radiology"], mentor: true, tip: "  Sleep.  ", li: "https://www.linkedin.com/in/amina", ig: "http://insta.com/x", x: "https://evil.com/x", web: "javascript:alert(1)" });
    expect(c.cls).toBe("2026");
    expect(c.ints).toEqual(["Paediatrics", "Surgery", "Research"]);
    expect(c.mentor).toBe(true);
    expect(c.tip).toBe("Sleep.");
    expect(c.li).toBe("https://www.linkedin.com/in/amina");
    expect(c.ig).toBeUndefined();
    expect(c.x).toBeUndefined();
    expect(c.web).toBeUndefined();
  });
  it("round-trips through a tag and strips it", () => {
    const t = extraTag({ cls: "2025", mentor: true });
    expect(extraFromTags(["year-7", t])).toEqual({ cls: "2025", mentor: true });
    expect(withoutExtraTag(["a", t])).toEqual(["a"]);
    expect(extraTag({})).toBe("");
  });
  it("finds the owner tag", () => {
    expect(ownerOf(["year-1", "owner-abc"])).toBe("owner-abc");
    expect(ownerOf(["year-1"])).toBe("");
  });
});
