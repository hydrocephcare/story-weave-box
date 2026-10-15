import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module shared with the server
import { buildPrompt, cleanChoices } from "../../supabase/functions/_shared/topicAi.js";

describe("topic page depth and the reader's choices", () => {
  it("writes the deep disease layout by default, with bedside, confounders and 10-12 questions", () => {
    const p = buildPrompt({ name: "Ascites", category: "Medicine" });
    expect(p).toContain("Bedside: history and how to examine");
    expect(p).toContain("Complicating and confounding factors");
    expect(p).toContain("10-12");
    expect(p).toContain("serum-ascites albumin gradient");
  });
  it("uses the reader's level, angles and setting, and falls back safely on rubbish", () => {
    const p = buildPrompt({ name: "Pulmonary tuberculosis", category: "Medicine", choices: { level: "year5", angles: ["drugs", "nonsense"], setting: "general", depth: "quick" } });
    expect(p).toContain("final-year student");
    expect(p).toContain("pharmacology");
    expect(p).not.toContain("nonsense");
    expect(p).not.toContain("DEPTH:");
    expect(cleanChoices({ level: "x", depth: "y" })).toMatchObject({ level: "year4", depth: "full", setting: "tropical" });
  });
});
