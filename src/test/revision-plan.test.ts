import { describe, expect, it } from "vitest";
import { buildScheduleRows, localDateStr } from "@/pages/RevisionPlanner";

const units = [
  { id: "u1", name: "Pathology" },
  { id: "u2", name: "Microbiology" },
];

describe("localDateStr", () => {
  it("formats using local calendar fields, not UTC", () => {
    // 23:30 local time on Jan 5th must stay Jan 5th regardless of the host's
    // UTC offset -- this is the exact bug that shifted Kenyan (UTC+3) study
    // days by one when the code used toISOString().slice(0, 10) instead.
    const d = new Date(2026, 0, 5, 23, 30);
    expect(localDateStr(d)).toBe("2026-01-05");
  });
});

describe("buildScheduleRows", () => {
  it("returns no rows when there are no units or no study days", () => {
    expect(buildScheduleRows([], 10, 60, [])).toEqual([]);
    expect(buildScheduleRows(units, 0, 60, [])).toEqual([]);
  });

  it("never schedules a session on a calendar day past the exam date", () => {
    const start = new Date(2026, 0, 1);
    const rows = buildScheduleRows(units, 5, 60, [], start);
    const lastDate = rows[rows.length - 1].scheduled_date;
    expect(lastDate <= "2026-01-05").toBe(true);
    for (const row of rows) {
      expect(row.scheduled_date >= "2026-01-01").toBe(true);
      expect(row.scheduled_date <= "2026-01-05").toBe(true);
    }
  });

  it("skips days listed in restDays", () => {
    const start = new Date(2026, 0, 1); // 2026-01-01 is a Thursday (day 4)
    const rows = buildScheduleRows(units, 14, 60, [4], start); // rest on Thursdays
    const restDayHit = rows.some((r) => new Date(`${r.scheduled_date}T00:00:00`).getDay() === 4);
    expect(restDayHit).toBe(false);
  });

  it("cycles through the chosen units round-robin", () => {
    const start = new Date(2026, 0, 1);
    const rows = buildScheduleRows(units, 4, 60, [], start);
    expect(rows.map((r) => r.unit_id)).toEqual(["u1", "u2", "u1", "u2"]);
  });

  it("caps the number of sessions at max(7, units*3) even with a long exam window", () => {
    const start = new Date(2026, 0, 1);
    const rows = buildScheduleRows(units, 100, 60, [], start);
    expect(rows.length).toBe(7);
  });

  it("returns an empty schedule when every day in the window is a rest day", () => {
    const start = new Date(2026, 0, 1);
    const rows = buildScheduleRows(units, 5, 60, [0, 1, 2, 3, 4, 5, 6], start);
    expect(rows).toEqual([]);
  });
});
