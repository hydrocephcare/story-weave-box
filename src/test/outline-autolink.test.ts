import { describe, expect, it } from "vitest";
import { COURSE_OUTLINES } from "@/data/courseOutlines";
import { STATIC_NOTES } from "@/data/staticNotes";

const linked = () => {
  const out: Record<string, string> = {};
  for (const o of COURSE_OUTLINES) for (const s of o.sections) for (const i of s.items) if (i.noteSlug) out[`${o.id}:${i.id}`] = i.noteSlug;
  return out;
};

describe("notes match their course outline topic automatically", () => {
  it("links the two neurodevelopmental notes to their psychiatry topics", () => {
    const l = Object.values(linked());
    expect(l).toContain("neurodevelopmental-disorders-adhd-disruptive-behaviour");
    expect(l).toContain("neurodevelopmental-disorders-autism-intellectual-disability");
  });

  it("only links notes that exist, and never a past paper or a question bank", () => {
    const slugs = new Map(STATIC_NOTES.map((n) => [n.slug, n]));
    for (const slug of Object.values(linked())) {
      const n = slugs.get(slug);
      expect(n, slug).toBeTruthy();
      expect(n!.paper, slug).toBeFalsy();
      expect(n!.group, slug).not.toBe("Question bank");
    }
  });

  it("keeps the hand-made psychiatry links", () => {
    const l = linked();
    expect(l["psychiatry:psy-s1-02"]).toBe("classification-of-mental-disorders");
    expect(l["psychiatry:psy-s2-01"]).toBe("introduction-to-psychopharmacology");
  });

  it("prints what was linked (for review)", () => {
    console.log(JSON.stringify(linked(), null, 1));
  });
});
