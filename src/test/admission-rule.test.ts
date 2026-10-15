import { describe, expect, it } from "vitest";
import { ruleFromExample, ruleMatches } from "@/lib/admissionRule";

describe("admission rules from an example", () => {
  it("copies the shape of a BMS number", () => {
    const r = ruleFromExample("BMS/2023/60482")!;
    expect(r.replacement).toBe("BMS/\\1/\\2");
    for (const ok of ["BMS/2023/60482", "bms 2024 12345", "BMS-2022-601234"]) expect(ruleMatches(r.pattern, ok), ok).toBe(true);
    for (const bad of ["BMS/23/60482", "XYZ/2023/60482", "BMS/2023", "2023/60482"]) expect(ruleMatches(r.pattern, bad), bad).toBe(false);
  });
  it("copies the shape of an MBCHB number", () => {
    const r = ruleFromExample("MBCHB262700349")!;
    expect(r.replacement).toBe("MBCHB\\1");
    expect(ruleMatches(r.pattern, "MBCHB 262700349")).toBe(true);
    expect(ruleMatches(r.pattern, "MBCHB26270034")).toBe(false);
  });
  it("refuses text that is not an admission number", () => {
    expect(ruleFromExample("hello")).toBeNull();
    expect(ruleFromExample("2023/60482")).toBeNull();
  });
});
