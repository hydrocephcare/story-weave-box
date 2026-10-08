import { describe, expect, it } from "vitest";
import { suggestionsFor } from "@/lib/ompathAiSuggest";
import { FREE_REVEALS_PER_SUBJECT, freeRevealsLeft, spendFreeReveal } from "@/lib/ompathAi";
import { OFFICIAL_2026_SCHEDULES } from "@/lib/timetable2026";
import { DEFAULT_UNIT_NAMES } from "@/lib/siteConfig";

const now = new Date(2026, 9, 8, 10);

describe("suggestions follow the student's year", () => {
  it("offers anatomy pictures and marathons to first and second years", () => {
    const s1 = suggestionsFor(1, OFFICIAL_2026_SCHEDULES[1], DEFAULT_UNIT_NAMES, now, []);
    expect(s1.chips.join("|")).toMatch(/Histology questions with pictures/);
    expect(s1.chips.join("|")).toMatch(/Anatomy marathon/);
    expect(suggestionsFor(2, OFFICIAL_2026_SCHEDULES[2], DEFAULT_UNIT_NAMES, now, []).chips.join("|")).toMatch(/Year 2 marathon/);
  });
  it("never offers anatomy to a fourth year, and uses this week's units", () => {
    const s4 = suggestionsFor(4, OFFICIAL_2026_SCHEDULES[4], DEFAULT_UNIT_NAMES, now, []);
    expect(s4.chips.join("|")).not.toMatch(/anatomy|histology|embryology|marathon/i);
    expect(s4.chips.join("|")).toMatch(/Notes on /);
  });
  it("asks for a year when it is not known", () => {
    expect(suggestionsFor(null, [], DEFAULT_UNIT_NAMES, now, []).chips).toContain("I am in year 1");
  });
});

describe("free answers", () => {
  it("gives the first batch free in each subject, then stops", () => {
    localStorage.clear();
    for (let i = 0; i < FREE_REVEALS_PER_SUBJECT; i++) expect(spendFreeReveal("histology", `q${i}`)).toBe(true);
    expect(spendFreeReveal("histology", "extra")).toBe(false);
    expect(spendFreeReveal("histology", "q0")).toBe(true); // one already opened can be opened again
    expect(freeRevealsLeft("histology")).toBe(0);
    expect(freeRevealsLeft("gross")).toBe(FREE_REVEALS_PER_SUBJECT);
  });
});
