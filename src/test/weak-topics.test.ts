import { beforeEach, describe, expect, it } from "vitest";
import { addWeak, dueNow, readWeak, review } from "@/lib/weakTopics";

describe("weak topics", () => {
  beforeEach(() => localStorage.clear());
  it("brings a missed question back after a day, then spaces it out, and drops it once learned", () => {
    addWeak("u1", { q: "What blocks oestrogen receptors?", why: "Tamoxifen is a SERM." });
    expect(dueNow("u1")).toHaveLength(0);
    const w = readWeak("u1"); w[0].due = Date.now() - 1000; localStorage.setItem("ompath_weak_u1", JSON.stringify(w));
    expect(dueNow("u1")).toHaveLength(1);
    review("u1", w[0].q, true);
    expect(readWeak("u1")[0].stage).toBe(1);
    review("u1", w[0].q, false);
    expect(readWeak("u1")[0].stage).toBe(0);
    for (let i = 0; i < 4; i++) review("u1", w[0].q, true);
    expect(readWeak("u1")).toHaveLength(0);
  });
  it("is separate for each student", () => {
    addWeak("a", { q: "q1 long enough", why: "" });
    expect(readWeak("b")).toHaveLength(0);
  });
});
