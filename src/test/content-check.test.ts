import { describe, expect, it } from "vitest";
import { chunkText } from "../../supabase/functions/_shared/contentCheck.js";

describe("clinical review chunking", () => {
  it("preserves a long single-line JSON payload without truncation", () => {
    const source = JSON.stringify(Array.from({ length: 80 }, (_, i) => ({
      question: "Clinical question " + i,
      answer: "A complete answer with relevant clinical reasoning " + i,
    })));
    const chunks = chunkText(source, 120);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((part) => part.length <= 120)).toBe(true);
    expect(chunks.join("")).toBe(source);
  });

  it("preserves newlines, whitespace and Unicode characters across chunk boundaries", () => {
    const source = ("## Clinical section\nA useful explanation with emoji 🩺 and spaces.\n\n").repeat(30);
    const chunks = chunkText(source, 75);
    expect(chunks.every((part) => part.length <= 75)).toBe(true);
    expect(chunks.join("")).toBe(source);
  });

  it("never exceeds the requested maximum when a separator sits just beyond the boundary", () => {
    const source = "a".repeat(120) + "\n" + "b".repeat(20);
    const chunks = chunkText(source, 120);
    expect(chunks.every((part) => part.length <= 120)).toBe(true);
    expect(chunks.join("")).toBe(source);
  });

  it("returns one empty chunk for empty input", () => {
    expect(chunkText("")).toEqual([""]);
  });
});
