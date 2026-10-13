import { describe, expect, it } from "vitest";
import { currentWeek, matchOutline, outlineLine, weekRange, type OutlineDoc } from "@/lib/outlineSync";

const doc: OutlineDoc = {
  id: "y4-s2-im", year: 4, semester: "2", unit: "Internal Medicine", startDate: "2026-09-07",
  rows: [
    { id: "1", week: "Week 5", topic: "Acute pancreatitis", lecturer: "Dr Otieno", detail: "" },
    { id: "2", week: "Week 6", topic: "Approach to anaemia", lecturer: "Dr Mwangi", detail: "" },
    { id: "3", week: "Week 7-8", topic: "Heart failure", lecturer: "", detail: "" },
  ],
};

describe("outline sync", () => {
  it("matches a page to the row it belongs to", () => {
    const m = matchOutline([doc], { title: "Acute Pancreatitis: causes, severity and management", year: 4 });
    expect(m?.row.id).toBe("1");
    expect(outlineLine(m!)).toBe("Year 4 · Semester 2 · Week 5 · Internal Medicine · Dr Otieno");
  });
  it("matches spelling variants and plurals", () => {
    expect(matchOutline([doc], { title: "Anemia: an approach", year: 4 })?.row.id).toBe("2");
    expect(matchOutline([doc], { title: "Congestive Heart Failure", year: 4 })?.row.id).toBe("3");
  });
  it("says nothing when nothing fits", () => {
    expect(matchOutline([doc], { title: "Malaria in pregnancy", year: 4 })).toBeNull();
    expect(matchOutline([doc], { title: "Heart", year: 4 })).toBeNull();
  });
  it("reads week numbers and ranges", () => {
    expect(weekRange("Week 7-8")).toEqual([7, 8]);
    expect(weekRange("Wk 3")).toEqual([3, 3]);
    expect(weekRange("")).toBeNull();
  });
  it("counts teaching weeks from the start date", () => {
    expect(currentWeek("2026-09-07", new Date("2026-09-07T08:00:00Z"))).toBe(1);
    expect(currentWeek("2026-09-07", new Date("2026-10-13T08:00:00Z"))).toBe(6);
    expect(currentWeek("2026-09-07", new Date("2026-08-01T08:00:00Z"))).toBeNull();
  });
});
