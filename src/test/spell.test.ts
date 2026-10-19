import { describe, expect, it } from "vitest";
import { localSuggestions } from "@/lib/spell";

const item = (n: string, s: string) => ({ s, n, c: "Medicine", y: [], d: 1, q: 0, i: 0, a: [], ai: 1 });
const items = [item("Neonatal jaundice", "neonatal-jaundice"), item("Percutaneous coronary intervention", "pci"), item("Helicobacter pylori", "h-pylori"), item("Asthma", "asthma")];

describe("localSuggestions", () => {
  it("finds a topic through spelling mistakes and a stray word", () => {
    expect(localSuggestions(items, "Percucutaneus eous Jaundice")[0].name).toMatch(/jaundice|percutaneous/i);
    expect(localSuggestions(items, "asthmaa")[0].name).toBe("Asthma");
    expect(localSuggestions(items, "helicobactr pylori")[0].name).toBe("Helicobacter pylori");
  });
  it("gives nothing for unrelated words", () => { expect(localSuggestions(items, "football")).toEqual([]); });
});
