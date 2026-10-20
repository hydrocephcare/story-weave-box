import { describe, expect, it } from "vitest";
import { keyWords, matchPercent } from "@/lib/voiceRecall";

const answer = "**Enhances GABA-A receptor-mediated chloride channel opening frequency.**\n- Binds to an allosteric site.";

describe("voice recall matching", () => {
  it("takes the key words from the bold headline", () => { expect(keyWords(answer)).toContain("chloride"); expect(keyWords(answer)).not.toContain("binds"); });
  it("forgives misheard spellings and split words", () => {
    expect(matchPercent(answer, "it enhances gaba receptor mediated chloride channel opening frequency")).toBeGreaterThanOrEqual(80);
    expect(matchPercent(answer, "it enhance gabba receptors mediated chlorine channel open frequency")).toBeGreaterThanOrEqual(50);
    expect(matchPercent("**Hypothyroidism**", "hypo thyroidism")).toBe(100);
  });
  it("gives a low score for an unrelated answer", () => { expect(matchPercent(answer, "it blocks sodium channels in the heart")).toBeLessThan(40); });
  it("uses the recogniser's other guesses", () => { expect(matchPercent("**Flumazenil**", "flu may senile", ["flumazenil"])).toBe(100); });
});
