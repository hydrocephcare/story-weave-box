import { describe, expect, it } from "vitest";
import { shortUssdText, splitUssdWords } from "./ompathLiteUssdFormat.js";

describe("USSD text formatting", () => {
  it("wraps long question stems at word boundaries", () => {
    const source = "A 58-year-old man with decompensated liver cirrhosis develops acute confusion, asterixis, and a reversal of the sleep-wake cycle.";
    const chunks = splitUssdWords(source, 45);
    expect(chunks.join(" ")).toBe(source);
    expect(chunks).toHaveLength(3);
    expect(chunks.every((chunk) => chunk.length <= 45)).toBe(true);
    expect(chunks[1]).not.toMatch(/^cycle/);
  });

  it("uses a shorter budget for non-ASCII UCS-2 text", () => {
    const chunks = splitUssdWords("Mgonjwa ana maumivu makali ya tumbo na kichefuchefu kinachoendelea", 105);
    expect(chunks.every((chunk) => chunk.length <= 48)).toBe(true);
  });

  it("shortens labels at word boundaries", () => {
    expect(shortUssdText("Permissive Hypotension, Thrombosis and Trauma", 28)).toBe("Permissive Hypotension...");
  });

  it("uses compact labels for non-ASCII screens", () => {
    expect(shortUssdText("Maumivu ya tumbo la chini", 24).length).toBeLessThanOrEqual(21);
  });
});
