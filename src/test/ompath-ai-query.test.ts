import { describe, expect, it } from "vitest";
import { followUps, parseQuery, scoringTerms } from "@/lib/ompathAiQuery";

describe("Ompath AI query parsing", () => {
  it("strips filler and expands abbreviations", () => {
    const p = parseQuery("pls i need psych notes");
    expect(p.topic).toBe("psychiatry");
    expect(p.wants).toBe("notes");
    expect(p.expansions).toContain("depression");
  });
  it("reads the year in several spellings", () => {
    expect(parseQuery("year 4 paeds notes").year).toBe(4);
    expect(parseQuery("yr3 pathology").year).toBe(3);
    expect(parseQuery("notes for fourth year surgery").year).toBe(4);
    expect(parseQuery("anatomy").year).toBeNull();
  });
  it("detects what the student wants", () => {
    expect(parseQuery("past papers on anatomy").wants).toBe("papers");
    expect(parseQuery("mcqs on heart failure").wants).toBe("mcqs");
    expect(parseQuery("year 2 timetable").wants).toBe("timetable");
    expect(parseQuery("pharmacology pdf").wants).toBe("files");
  });
  it("treats real questions as questions", () => {
    const p = parseQuery("What is Light's criteria?");
    expect(p.isQuestion).toBe(true);
    expect(p.wants).toBe("answer");
  });
  it("normalises American spellings", () => {
    expect(parseQuery("anemia in pediatrics").topic).toContain("anaemia");
    expect(parseQuery("anemia in pediatrics").topic).toContain("paediatrics");
  });
  it("gives search words and follow-ups", () => {
    const p = parseQuery("nephrotic syndrome in children");
    expect(scoringTerms(p)).toContain("nephrotic");
    expect(followUps(p).length).toBeGreaterThan(0);
  });
});
