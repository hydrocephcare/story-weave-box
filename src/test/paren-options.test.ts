import { describe, expect, it } from "vitest";
import { normaliseParenOptions } from "@/lib/parenOptions";

describe("normaliseParenOptions", () => {
  it("lifts a (a)-(e) run to A) lines", () => {
    expect(normaliseParenOptions("1. Stem\n(a) one\n(b) two\n(c) three\n(d) four")).toBe("1. Stem\nA) one\nB) two\nC) three\nD) four");
  });
  it("lifts plain a) b) c) lines too", () => {
    expect(normaliseParenOptions("1. Stem\na) one\nb) two\nc) three")).toBe("1. Stem\nA) one\nB) two\nC) three");
  });
  it("leaves written parts alone", () => {
    const t = "2. Discuss.\n(a) Describe the heart (5 marks)\n(b) Explain the valves (5 marks)\n(c) List the nerves (5 marks)";
    expect(normaliseParenOptions(t)).toBe(t);
  });
  it("needs three options", () => {
    expect(normaliseParenOptions("(a) x\n(b) y")).toBe("(a) x\n(b) y");
  });
});
