import { describe, expect, it } from "vitest";
import { cleanMeta, isBank, isScanOnly, needsMcqFormat, parseJson, soundPolish, yearOf } from "../../api/_lib/blogPolishCore.js";
import { applyPolish, polishedIds, wantsPolish } from "@/lib/blogPolish";

const note = "## Heart\n\nThe heart pumps blood. The left ventricle ejects 70 mL per beat at rest, about 5000 mL each minute in an adult. Valves keep the flow in one direction.\n\n## Valves\n\nThe mitral valve and the aortic valve control the left side. Stenosis narrows the valve and regurgitation lets blood leak backwards.";

describe("blog polish helpers", () => {
  it("reads the year from the category", () => {
    expect(yearOf("Year 2: Clinical Biochemistry")).toBe(2);
    expect(yearOf("Uncategorized")).toBe(0);
  });

  it("judges a bank by what is inside it, not by its title", () => {
    expect(isBank("# Respiratory System Examination — Complete Study Guide\n\nlong lecture notes ".repeat(20))).toBe(false);
    const bank = Array.from({ length: 6 }, (_, i) => `Question ${i + 1}\nWhat?\nA. a\nB. b\nC. c\nD. d\nAnswer: B`).join("\n\n");
    expect(isBank(bank)).toBe(true);
  });

  it("knows when a bank is not yet in the site's question format", () => {
    const messy = Array.from({ length: 6 }, (_, i) => `Question ${i + 1}\nWhat?\nA. a\nB. b\nC. c\nD. d`).join("\n\n");
    expect(needsMcqFormat(messy)).toBe(true);
    const tidy = Array.from({ length: 6 }, (_, i) => `### Question ${i + 1}\nWhat?\nA. a\nB. b\nC. c\nD. d\nAnswer: B. b`).join("\n\n");
    expect(needsMcqFormat(tidy)).toBe(false);
    expect(needsMcqFormat("Question 1\nDiscuss the heart.\nQuestion 2\nDiscuss the lung.")).toBe(false);
  });

  it("leaves scan-only pages alone", () => {
    expect(isScanOnly("# Biochemistry EOY 2015 — Visual Scan Archive\n\nnoise")).toBe(true);
    expect(isScanOnly(note)).toBe(false);
  });

  it("accepts a polish that keeps the facts and rejects one that loses them", () => {
    expect(soundPolish(note, note.replace("Valves keep", "The valves keep"))).toBe("");
    expect(soundPolish(note, "## Heart\n\nThe heart pumps blood.\n\n## Valves\n\nShort.")).not.toBe("");
    expect(soundPolish(note, note.replace("70 mL", "80 mL").replace("5000 mL", "6000 mL").replace("mitral", "m"))).toContain("");
  });

  it("rejects a polish that loses a picture", () => {
    const withPic = `${note}\n\n![diagram](https://example.com/a.png)`;
    expect(soundPolish(withPic, note)).toBe("pictures lost");
  });

  it("cleans a title and a description", () => {
    const m = cleanMeta('  "Heart Valves: Stenosis and Regurgitation"  ', "x".repeat(300));
    expect(m.title).toBe("Heart Valves: Stenosis and Regurgitation");
    expect(m.description.length).toBeLessThanOrEqual(161);
    expect(cleanMeta("abc", "short")).toEqual({ title: "", description: "" });
  });

  it("reads the model's JSON answer even with words around it", () => {
    expect(parseJson('Here you go: {"verdict":"keep","title":"A"} thanks')).toEqual({ verdict: "keep", title: "A" });
    expect(parseJson("no json")).toBeNull();
  });
});

describe("applying a polish on the page", () => {
  it("only polishes Year 1 to 3 and never a protected page", () => {
    expect(wantsPolish({ category: "Year 2: Clinical Biochemistry" })).toBe(true);
    expect(wantsPolish({ category: "Year 4: Surgery" })).toBe(false);
    expect(wantsPolish({ category: "Year 3: X", password_protected: true })).toBe(false);
  });

  it("lays the polished title, description and text over the article", () => {
    const a = { id: "x1", title: "old", content: "old text", meta_title: null, meta_description: null };
    const out = applyPolish(a, { title: "New Title Here", description: "d".repeat(60), content: "new text ".repeat(40), verdict: "keep", status: "done" });
    expect(out.title).toBe("New Title Here");
    expect(out.meta_description).toHaveLength(60);
    expect(out.content.startsWith("new text")).toBe(true);
    expect(polishedIds.has("x1")).toBe(true);
  });

  it("keeps the original text when the polish has none", () => {
    const a = { id: "x2", title: "old", content: "old text", meta_title: null, meta_description: null };
    const out = applyPolish(a, { title: "New Title Here", description: null, content: null, verdict: "keep", status: "partial" });
    expect(out.content).toBe("old text");
    expect(polishedIds.has("x2")).toBe(false);
  });
});
