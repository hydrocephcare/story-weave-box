import { describe, expect, it } from "vitest";
import { personalReply, type PersonalCtx } from "@/lib/ompathAiPersonal";
import { OFFICIAL_2026_SCHEDULES } from "@/lib/timetable2026";
import { DEFAULT_UNIT_NAMES } from "@/lib/siteConfig";

// Thursday 8 October 2026, mid-trimester
const ctx = (over: Partial<PersonalCtx> = {}): PersonalCtx => ({ year: 1, signedIn: true, status: "verified", group: "", tables: OFFICIAL_2026_SCHEDULES, unitNames: DEFAULT_UNIT_NAMES, keyDates: [], now: new Date(2026, 9, 8, 10), ...over });

describe("personalReply", () => {
  it("shows tomorrow's timetable for the student's own year", () => {
    const r = personalReply("what do we have tomorrow?", ctx());
    expect(r?.answer).toMatch(/Friday/);
    expect(r?.answer).toMatch(/Year 1/);
  });
  it("makes a signed-out student log in first", () => {
    const r = personalReply("what do we have tomorrow", ctx({ signedIn: false }));
    expect(r?.links?.[0].href).toMatch(/login/);
    expect(r?.answer).not.toMatch(/Friday/);
  });
  it("asks for the year when it is not known", () => {
    expect(personalReply("timetable for tomorrow", ctx({ year: null }))?.answer).toMatch(/Which year/);
  });
  it("reads a year said in the question", () => {
    expect(personalReply("year 3 timetable tomorrow", ctx())?.answer).toMatch(/Year 3/);
  });
  it("does not treat note requests as timetable questions", () => {
    expect(personalReply("lecture notes on tuberculosis", ctx())).toBeNull();
    expect(personalReply("what class of drug is metformin", ctx())).toBeNull();
  });
  it("lists lecturers without inventing who teaches what", () => {
    const r = personalReply("which lecturers do we have", ctx({ year: 4 }));
    expect(r?.answer).toMatch(/Siboe/);
    expect(r?.answer).toMatch(/will not guess/);
  });
  it("tells a first year they can publish a story", () => {
    const r = personalReply("i am a first year can i publish my story", ctx());
    expect(r?.answer).toMatch(/does not stop you/);
    expect(r?.links?.some((l) => l.href.startsWith("/stories"))).toBe(true);
  });
  it("remembers the year and group", () => {
    expect(personalReply("i am in year 4", ctx())?.setYear).toBe(4);
    expect(personalReply("i am group b", ctx())?.setGroup).toBe("B");
  });
  it("gives advice for the student's year", () => {
    expect(personalReply("any advice for me", ctx({ year: 3 }))?.answer).toMatch(/Year 3 advice/);
  });
  it("leaves study questions to the notes search", () => {
    for (const q of ["psychiatry notes", "explain nephrotic syndrome", "first line drugs for hypertension"]) expect(personalReply(q, ctx()), q).toBeNull();
  });
});
