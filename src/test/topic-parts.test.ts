import { describe, expect, it } from "vitest";
import { buildPartPrompts, mergeParts, parseJsonReply } from "../../supabase/functions/_shared/topicParts.js";

const part1 = { medical: true, summary: "Acute leukaemia is a fast-growing cancer of the blood-forming cells in the bone marrow that needs urgent care.", aka: ["AML", "ALL"], sections: [{ h: "Definition", p: "Cancer of blasts." }, { h: "Presentation", b: ["Anaemia, bleeding and infections"] }] };
const part3 = { medical: true, sections: [{ h: "Management", p: "Treat the cause first.", b: ["Chemotherapy in a specialist unit"] }] };
const part2 = { medical: true, whenToSeekHelp: ["Fever with very low white cells"], faq: [{ q: "Is it curable in children?", a: "Many children are cured with treatment." }], exam: ["How do you tell AML from ALL?"], related: ["Chronic leukaemia"], sections: [{ h: "Often confused with", b: ["Leukaemoid reaction in severe infection"] }] };

describe("topic page parts (Ompath AI route)", () => {
  it("asks for three parts for a condition and two for anatomy", () => {
    expect(buildPartPrompts({ name: "Acute leukaemia", category: "Pathology" })).toHaveLength(3);
    expect(buildPartPrompts({ name: "Humerus", category: "Anatomy" })).toHaveLength(2);
  });

  it("joins the parts in order and keeps the questions and warning signs", () => {
    const page = mergeParts([part1, part3, part2], { name: "Acute leukaemia", category: "Pathology", model: "gemini" });
    expect(page.sections.map((s: { h: string }) => s.h)).toEqual(["Definition", "Presentation", "Management", "Often confused with"]);
    expect(page.exam).toHaveLength(1);
    expect(page.whenToSeekHelp).toHaveLength(1);
    expect(page.kind).toBe("disease");
  });

  it("still publishes when the later parts fail, and turns away a non-medical topic", () => {
    const page = mergeParts([{ ...part1, sections: [...part1.sections, { h: "Causes", b: ["Unknown in most cases"] }] }, null, null], { name: "Acute leukaemia", category: "Pathology", model: "gemini" });
    expect(page.sections).toHaveLength(3);
    expect(mergeParts([{ medical: false }, null], { name: "Taylor Swift", category: "", model: "gemini" })).toEqual({ medical: false });
  });

  it("pulls JSON out of a reply that has extra words around it", () => {
    expect(parseJsonReply("Here you go: {\"medical\": true} thanks")).toEqual({ medical: true });
    expect(parseJsonReply("no json here")).toBeNull();
  });
});
