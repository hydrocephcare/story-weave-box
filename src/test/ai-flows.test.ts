import { beforeEach, describe, expect, it } from "vitest";
import { parseWhen, reminderIcs, readReminders } from "@/lib/reminders";
import { flowReply, type FlowCtx } from "@/lib/ompathAiFlows";
import { buildPlan } from "@/lib/studyPlan";

// Thursday 8 October 2026, 10:00
const now = new Date(2026, 9, 8, 10, 0);
const at = (ts: number | null) => (ts === null ? null : new Date(ts).toISOString().slice(0, 16));
const local = (y: number, mo: number, d: number, h: number, mi = 0) => at(new Date(y, mo, d, h, mi).getTime());

describe("parseWhen", () => {
  it("reads a day and a time", () => {
    expect(at(parseWhen("remind me to revise cardiology tomorrow at 6 pm", now).at)).toBe(local(2026, 9, 9, 18));
    expect(parseWhen("remind me to revise cardiology tomorrow at 6 pm", now).text).toBe("revise cardiology");
    expect(at(parseWhen("remind me to read at 7:30 am tomorrow", now).at)).toBe(local(2026, 9, 9, 7, 30));
  });
  it("reads relative times and weekdays", () => {
    expect(at(parseWhen("remind me in 2 hours", now).at)).toBe(local(2026, 9, 8, 12));
    expect(at(parseWhen("remind me on friday at 5 pm", now).at)).toBe(local(2026, 9, 9, 17));
    expect(at(parseWhen("tonight", now).at)).toBe(local(2026, 9, 8, 20));
  });
  it("says so when there is no time", () => {
    expect(parseWhen("remind me to revise renal", now).at).toBeNull();
    expect(parseWhen("remind me to revise renal tomorrow", now).at).toBeNull();
  });
  it("does not mistake a number in the topic for a time", () => {
    expect(parseWhen("remind me to read chapter 5 of anatomy", now).at).toBeNull();
  });
});

describe("calendar file", () => {
  it("makes an event with an alarm", () => {
    const ics = reminderIcs([{ id: "a", text: "Revise cardiology", at: new Date(2026, 9, 9, 18).getTime() }]);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Revise cardiology");
    expect(ics).toContain("BEGIN:VALARM");
  });
});

const ctx = (over: Partial<FlowCtx> = {}): FlowCtx => ({ year: 4, units: ["Paediatrics & Child Health", "Internal Medicine"], weak: [], keyDates: [{ id: "c", label: "End-of-semester CATs", date: "2026-12-08" }], now, canReminders: true, ...over });

describe("flows", () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
  it("sets a reminder in one message", () => {
    const r = flowReply("remind me to revise cardiology tomorrow at 6 pm", ctx());
    expect(r?.reminder?.text).toBe("revise cardiology");
    expect(readReminders()).toHaveLength(1);
  });
  it("asks when, then finishes from the tapped answer", () => {
    const first = flowReply("remind me to revise renal", ctx());
    expect(first?.clarify?.options.length).toBeGreaterThan(2);
    const second = flowReply("tomorrow at 6 pm", ctx());
    expect(second?.reminder?.text).toBe("revise renal");
  });
  it("is Pro only", () => {
    expect(flowReply("remind me to revise renal tomorrow at 6 pm", ctx({ canReminders: false }))?.locked).toBe("reminders");
    expect(readReminders()).toHaveLength(0);
  });
  it("builds a plan after asking about time and length", () => {
    const a = flowReply("make me a study plan", ctx());
    expect(a?.clarify?.question).toMatch(/each day/);
    const b = flowReply("I can study 2 hours a day", ctx());
    expect(b?.clarify?.question).toMatch(/How long/);
    const c = flowReply("plan for this week", ctx());
    expect(c?.plan?.days).toHaveLength(7);
    expect(c?.plan?.days[0].blocks.length).toBeGreaterThan(0);
  });
  it("asks for the year first when it is not known", () => {
    expect(flowReply("make me a study plan", ctx({ year: null }))?.clarify?.question).toMatch(/year/);
  });
  it("ignores everything else", () => {
    expect(flowReply("notes on psychiatry", ctx())).toBeNull();
    expect(flowReply("hello", ctx())).toBeNull();
  });
});

describe("buildPlan", () => {
  it("fills each day and ends the week with a mock", () => {
    const p = buildPlan({ year: 4, units: ["A", "B", "C"], weak: ["Cardiology"], hoursPerDay: 3, days: 7, now });
    expect(p.days).toHaveLength(7);
    expect(p.days[0].blocks[0].unit).toBe("Cardiology");
    expect(p.days[6].note).toBe("Mock day");
  });
});

describe("plan flow with an unknown year", () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
  it("asks the year, remembers the answer and carries on", () => {
    const a = flowReply("make me a study plan", ctx({ year: null }));
    expect(a?.clarify?.question).toMatch(/year/);
    const b = flowReply("I am in year 2", ctx({ year: null }));
    expect(b?.setYear).toBe(2);
    expect(b?.clarify?.question).toMatch(/each day/);
  });
});
