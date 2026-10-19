import { describe, expect, it } from "vitest";
import { label, requeueGap, schedule, type CardState } from "@/lib/deckSrs";

const DAY = 86_400_000;
const T = 1_000_000_000_000;

describe("deck spaced repetition", () => {
  it("a new card marked Good comes back tomorrow, then in 3 days, then stretches by its ease", () => {
    const a = schedule(undefined, "good", T);
    expect(a.due - T).toBe(1 * DAY);
    const b = schedule(a, "good", a.due);
    expect(Math.round((b.due - a.due) / DAY)).toBe(3);
    const c = schedule(b, "good", b.due);
    expect(Math.round((c.due - b.due) / DAY)).toBe(Math.round(3 * 2.5));
  });
  it("Again drops the card back to a minute and lowers its ease", () => {
    const known: CardState = { ef: 2.5, iv: 10, reps: 4, lapses: 0, due: T };
    const a = schedule(known, "again", T);
    expect(a.due - T).toBe(60_000);
    expect(a.reps).toBe(0);
    expect(a.ef).toBeCloseTo(2.3, 5);
    expect(a.lapses).toBe(1);
  });
  it("Hard grows the gap a little; Easy grows it a lot", () => {
    const k: CardState = { ef: 2.5, iv: 10, reps: 4, lapses: 0, due: T };
    expect(Math.round((schedule(k, "hard", T).due - T) / DAY)).toBe(12);
    expect(Math.round((schedule(k, "easy", T).due - T) / DAY)).toBe(Math.round(10 * 2.5 * 1.3));
  });
  it("labels the buttons", () => {
    expect(label(undefined, "again", T)).toBe("<1m");
    expect(label(undefined, "hard", T)).toBe("10m");
    expect(label(undefined, "good", T)).toBe("1d");
    expect(label(undefined, "easy", T)).toBe("4d");
  });
  it("brings a missed card back within the session", () => {
    expect(requeueGap("again", schedule(undefined, "again", T))).toBe(3);
    expect(requeueGap("hard", schedule(undefined, "hard", T))).toBe(7);
    expect(requeueGap("good", schedule(undefined, "good", T))).toBe(0);
  });
});
