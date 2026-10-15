import { describe, expect, it } from "vitest";
import { buildPrompt, buildDeepPrompt, sanitizeDeep, cleanChoices } from "../../supabase/functions/_shared/topicAi.js";

describe("revision page and deep exam notes", () => {
  it("the revision page is written short, as before (6-8 questions, no deep rules)", () => {
    const p = buildPrompt({ name: "Ascites", category: "Medicine" });
    expect(p).toContain("6-8");
    expect(p).not.toContain("DEPTH:");
    expect(cleanChoices({ level: "x", depth: "y" })).toMatchObject({ depth: "quick" });
  });
  it("the deep notes prompt shows the writer what the revision page already has and asks for what is missing", () => {
    const p = buildDeepPrompt({ name: "Ascites", category: "Medicine", base: { sections: [{ h: "Causes", b: ["Cirrhosis is the commonest cause"] }], exam: ["What is SAAG? — a gradient"] } });
    expect(p).toContain("Causes");
    expect(p).toContain("Cirrhosis is the commonest cause");
    expect(p).toContain("What is SAAG?");
    expect(p).toContain("Do NOT repeat");
    expect(p).toContain("serum-ascites albumin gradient");
  });
  it("deep notes are checked like a page (no doses) and refused when too thin", () => {
    const sec = (h: string) => ({ h, b: [`${h}: a clear point to learn`] });
    const exam = Array.from({ length: 8 }, (_, i) => `Question ${i + 1} what next? — answer`);
    const ok = sanitizeDeep({ sections: ["Bedside", "Tests", "Confounders", "Management"].map(sec), exam }, "Ascites");
    expect(ok.sections).toHaveLength(4);
    expect(ok.exam).toHaveLength(8);
    expect(() => sanitizeDeep({ sections: [sec("Bedside")], exam: ["Only one question? — answer"] }, "Ascites")).toThrow();
    const dosed = sanitizeDeep({ sections: [...["Bedside", "Tests", "Confounders", "Management"].map(sec), { h: "Drugs", b: ["Give 500 mg twice daily", "Spironolactone is first line"] }], exam }, "Ascites");
    expect(JSON.stringify(dosed)).not.toContain("500 mg");
  });
});
