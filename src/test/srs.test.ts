import { beforeEach, describe, expect, it } from "vitest";
import { srs, streak } from "@/lib/srs";

describe("daily review deck", () => {
  beforeEach(() => { localStorage.clear(); for (const c of [...srs.all()]) srs.remove(c.id); });

  it("adds cards once and finds them due", () => {
    expect(srs.add([{ q: "What is the commonest cause of X?", a: "Y" }, { q: "How is X diagnosed?", a: "By Z" }], { title: "X", path: "/topic/x" })).toBe(2);
    expect(srs.add([{ q: "What is the commonest cause of X?", a: "Y" }], { title: "X", path: "/topic/x" })).toBe(0);
    expect(srs.due()).toHaveLength(2);
  });
  it("brings a card back later when it is remembered, and soon when it is not", () => {
    srs.add([{ q: "A question long enough to keep?", a: "An answer" }], { title: "T", path: "/topic/t" });
    const id = srs.all()[0].id;
    srs.grade(id, 2);
    const good = srs.all().find((c) => c.id === id)!;
    expect(good.due).toBeGreaterThan(Date.now() + 86_400_000);
    srs.grade(id, 0);
    const again = srs.all().find((c) => c.id === id)!;
    expect(again.due).toBeLessThan(Date.now() + 3_600_000);
    expect(again.reps).toBe(0);
  });
  it("counts a streak once a day", () => {
    expect(streak.get().n).toBe(0);
    streak.touch(); streak.touch();
    expect(streak.get()).toEqual({ n: 1, today: true });
  });
});
