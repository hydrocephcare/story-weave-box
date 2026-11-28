import { describe, expect, it } from "vitest";
import { deepNoteReady, topicBaseReady } from "../../api/_lib/deepNoteReadiness.js";

const common = {
  checked: "2026-11-28",
  sections: Array.from({ length: 7 }, (_, i) => ({ h: `Section ${i + 1}` })),
  mcqs: Array.from({ length: 6 }, (_, i) => ({ q: `Question ${i + 1}` })),
  cases: Array.from({ length: 2 }, (_, i) => ({ v: `Case ${i + 1}` })),
  facts: Array.from({ length: 6 }, (_, i) => `Fact ${i + 1}`),
  mistakes: Array.from({ length: 5 }, (_, i) => `Mistake ${i + 1}`),
};

describe("published topic base readiness", () => {
  it("requires a substantive summary and at least three sections", () => {
    expect(topicBaseReady({
      summary: "A sufficiently long summary that describes the published revision page.",
      sections: [{ h: "A" }, { h: "B" }, { h: "C" }],
    })).toBe(true);
  });

  it("rejects empty or incomplete base pages", () => {
    expect(topicBaseReady(null)).toBe(false);
    expect(topicBaseReady({ summary: "Too short", sections: [{ h: "A" }, { h: "B" }, { h: "C" }] })).toBe(false);
    expect(topicBaseReady({ summary: "A sufficiently long summary for this test case.", sections: [{ h: "A" }, { h: "B" }] })).toBe(false);
  });
});

describe("deep-note readiness", () => {
  it("accepts the current viva-based generator format", () => {
    expect(deepNoteReady({
      ...common,
      vivas: Array.from({ length: 12 }, (_, i) => ({ q: `Viva ${i + 1}`, a: "Answer" })),
    })).toBe(true);
  });

  it("continues to accept legacy exam-array records", () => {
    expect(deepNoteReady({
      ...common,
      exam: Array.from({ length: 12 }, (_, i) => `Question ${i + 1} — Answer`),
    })).toBe(true);
  });

  it("rejects notes without a completed independent check", () => {
    expect(deepNoteReady({
      ...common,
      checked: "",
      vivas: Array.from({ length: 12 }, () => ({ q: "Viva question", a: "Answer" })),
    })).toBe(false);
  });

  it("rejects incomplete notes even when the viva count is sufficient", () => {
    expect(deepNoteReady({
      ...common,
      sections: common.sections.slice(0, 6),
      vivas: Array.from({ length: 12 }, () => ({ q: "Viva question", a: "Answer" })),
    })).toBe(false);
  });
});
