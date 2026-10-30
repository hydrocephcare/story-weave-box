import { describe, expect, it } from "vitest";
import { formatCheck, STYLE_GUIDE } from "../src/lib/style";

const good =
  "# Approach to Jaundice\n\n**Year 4 · Internal Medicine · Hepatology**\n\n> **In one line:** a sign, not a diagnosis.\n\n## What you must know\n\n- x\n\n## Causes\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n> **Exam tip:** y\n\n## Key points to revise\n\n- z\n\n*Source: texts.*\n\n" +
  "word ".repeat(950);

describe("format check", () => {
  it("scores a lesson in the house format fully", () => {
    const r = formatCheck(good);
    expect(r.missing).toEqual([]);
    expect(r.score).toBe(r.of);
  });

  it("flags the problems found in the first AI-published lesson: numbered headings, no summary, no table, thin", () => {
    const r = formatCheck("# T\n\nintro\n\n## 1. Start\n\ntext\n\n## 2. Next\n\ntext\n\n## Key points to revise\n\n- a\n");
    const all = r.missing.join(" ");
    expect(all).toMatch(/unnumbered/);
    expect(all).toMatch(/In one line/);
    expect(all).toMatch(/table/);
    expect(all).toMatch(/Year N/);
    expect(r.score).toBeLessThan(8);
  });

  it("the style guide names every part the check looks for", () => {
    for (const part of ["In one line", "What you must know", "Key points to revise", "Exam tip", "Source:", "Year N"]) expect(STYLE_GUIDE).toContain(part);
  });
});
