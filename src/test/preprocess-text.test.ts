import { describe, expect, it } from "vitest";
import { preprocessContent } from "@/lib/blog-content";

const run = (s: string) => preprocessContent(s);

describe("preprocessContent keeps real text intact", () => {
  it("keeps abbreviations and plural acronyms whole", () => {
    const out = run("Causes include sepsis (e.g., RBCs lysed, NSAIDs, ATPase, UTIs and FFAs). Check cTnI.");
    expect(out).toContain("e.g.,");
    for (const w of ["RBCs", "NSAIDs", "ATPase", "UTIs", "FFAs", "cTnI"]) expect(out).toContain(w);
  });
  it("keeps ratios and times", () => {
    expect(run("AST/ALT ratio >2:1 suggests alcohol; clinic at 10:30")).toContain("2:1");
  });
  it("adds the missing space where words were glued together", () => {
    const out = run("- **Preparation for Collection**Patient instructions: diet.\n- **Sampling Preparation****Test request**, labels.");
    expect(out).toContain("Collection** Patient");
    expect(out).toContain("Preparation** **Test request**");
    expect(run("Proteinuria and ProteinuriaEspecially when persistent")).toContain("Proteinuria Especially");
  });
});
