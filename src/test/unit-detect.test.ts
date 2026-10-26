import { describe, expect, it } from "vitest";
import { detectUnit } from "@/lib/unitDetect";

describe("detectUnit", () => {
  it("files an acute abdomen note under Surgery even when it mentions physiology", () => {
    const body = "SURGERY CAT NOTES: ACUTE ABDOMEN. MBChB Year 4. Acute appendicitis, peritonitis, perforated peptic ulcer. Pathophysiology of visceral pain. Laparotomy, guarding and rigidity, postoperative care.";
    expect(detectUnit("Acute Abdomen and Appendicitis Notes (part 1 of 5)", body)).toBe("Year 4: Surgery");
  });
  it("leaves a preclinical note alone", () => {
    expect(detectUnit("Renal physiology: the nephron", "Glomerular filtration rate and tubular reabsorption.")).toBe("");
  });
  it("recognises paediatrics", () => {
    expect(detectUnit("Neonatal jaundice", "Newborn infant neonate kwashiorkor milestones immunisation paediatric ward")).toBe("Year 4: Paediatrics");
  });
});
