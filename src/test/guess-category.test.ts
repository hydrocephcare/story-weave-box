import { describe, expect, it } from "vitest";
import { guessCategory, splitLongNote } from "@/lib/adminWriter";

const cats = ["Year 3: Basic Pharmacology III", "Year 4: Internal Medicine", "Year 4: Psychiatry", "Year 2: Biochemistry"];

describe("guessCategory", () => {
  it("reads the unit from the opening of the pasted text", () => {
    expect(guessCategory("### Diazepam — Year 4 MBChB Pharmacology Notes\n\nDrug class: Benzodiazepine", cats)).toBe("Year 3: Basic Pharmacology III");
    expect(guessCategory("Glycolysis and the Krebs cycle: biochemistry revision", cats)).toBe("Year 2: Biochemistry");
  });
  it("says nothing when the opening names no unit", () => { expect(guessCategory("A note about something else entirely", cats)).toBe(""); });
});

describe("splitLongNote", () => {
  it("keeps a short note whole and cuts a long one at headings", () => {
    expect(splitLongNote("## A\n\ntext")).toHaveLength(1);
    const long = Array.from({ length: 8 }, (_, i) => `## Part ${i}\n\n${"word ".repeat(450)}`).join("\n\n");
    const parts = splitLongNote(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("\n")).toContain("## Part 7");
  });
});
