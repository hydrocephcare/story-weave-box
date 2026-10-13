import { describe, expect, it } from "vitest";
import { polishStep, stepPlan } from "../../api/_lib/blogPolishRun.js";

// a long note: many sections of plain text
const section = (i: number) => `## Part ${i}\n\n${Array.from({ length: 12 }, (_, k) => `The mitral valve and the aortic valve control the left side number ${i}-${k} of the heart in adults today.`).join(" ")}`;
const longNote = Array.from({ length: 30 }, (_, i) => section(i)).join("\n\n");
const article = { id: "1", title: "Heart", category: "Year 2: Physiology", content: longNote };

// the model "polishes" a piece by returning it unchanged under a numbered heading
const echo = async (prompt: string) => {
  const m = prompt.match(/PART:\n"""\n([\s\S]*?)\n"""/);
  return m ? m[1] : "";
};

describe("polishing a long page a few pieces per visit", () => {
  it("cuts a long note into pieces and polishes nothing that is already in the layout", () => {
    expect(stepPlan(article)?.parts.length).toBeGreaterThan(3);
    expect(stepPlan({ ...article, content: "# Visual Scan Archive\n\nnoise" })).toBeNull();
    expect(stepPlan({ ...article, content: "[locked ref=\"1\"]\nsecret\n[/locked]\n" + longNote })).toBeNull();
  });

  it("carries on from where the last visit stopped, and never repeats a piece", async () => {
    const total = stepPlan(article)!.parts.length;
    let calls = 0;
    const ask = async (p: string) => { calls++; await new Promise((r) => setTimeout(r, 6)); return echo(p); };
    // each visit has room for only one piece
    let state: { parts_done: number; content: string } = { parts_done: 0, content: "" };
    let finished = false, visits = 0, last;
    while (!finished && visits < total + 2) {
      visits++;
      const r = await polishStep(article, ask, state, { budgetMs: 3 });
      state = { parts_done: r.parts_done, content: r.content ?? "" };
      finished = r.finished; last = r;
    }
    expect(visits).toBe(total);
    expect(calls).toBe(total); // one request per piece: nothing was done twice
    expect(last!.content).toBeTruthy();
    expect(last!.content!.replace(/\s+/g, "")).toBe(longNote.replace(/\s+/g, ""));
  });

  it("throws the whole page away if the pieces together lost too much", async () => {
    const r1 = await polishStep(article, async () => "## Part\n\nShort.", { parts_done: 0, content: "" }, { budgetMs: 60_000 });
    expect(r1.finished).toBe(true);
    expect(r1.content).toBeNull();
    expect(r1.reason).toContain("could not be polished safely");
  });
});

describe("a piece that fails the check", () => {
  it("stays as the author wrote it and the rest of the page is still polished", async () => {
    let n = 0;
    const ask = async (p: string) => { n++; const m = p.match(/PART:\n"""\n([\s\S]*?)\n"""/); const text = m ? m[1] : ""; return n === 2 ? "## Short\n\nx" : text; };
    let state: { parts_done: number; raw: number; content: string } = { parts_done: 0, raw: 0, content: "" };
    let r;
    for (let i = 0; i < 40; i++) {
      r = await polishStep(article, ask, state, { budgetMs: 0 });
      state = { parts_done: r.parts_done, raw: r.raw ?? 0, content: r.content ?? "" };
      if (r.finished) break;
    }
    expect(r!.finished).toBe(true);
    expect(r!.content).toBeTruthy(); // one bad piece of many does not throw the page away
    expect(r!.content!.replace(/\s+/g, "")).toBe(longNote.replace(/\s+/g, ""));
    expect(state.raw).toBe(1);
  });

  it("gives the page up when most pieces fail", async () => {
    const r = await polishStep(article, async () => "## Short\n\nx", { parts_done: 0, raw: 0, content: "" }, { budgetMs: 100000 });
    expect(r.finished).toBe(true);
    expect(r.content).toBeNull();
    expect(r.reason).toContain("could not be polished safely");
  });
});
