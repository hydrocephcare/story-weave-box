import { describe, expect, it } from "vitest";
import { findCondition, findDrug, pharmReply } from "@/lib/ompathAiPharm";

describe("pharmacology answers from the site library", () => {
  it("finds a drug by its name and a combined entry by either name", () => {
    expect(findDrug("side effects of furosemide")?.id).toBe("furosemide");
    expect(findDrug("what is heparin used for")?.id).toBe("heparin");
    expect(findDrug("tell me about enoxaparin")?.id).toBe("heparin");
  });
  it("answers one part of a drug when that is what was asked", () => {
    const r = pharmReply("what is the dose of ceftriaxone")!;
    expect(r.answer).toContain("**Typical dose:**");
    expect(r.answer).not.toContain("**Adverse effects:**");
    expect(r.links[0].href).toContain("/pharmacology/drug/ceftriaxone");
  });
  it("gives the whole card for a bare drug name", () => {
    const r = pharmReply("metformin")!;
    expect(r.answer).toContain("**Class:**");
    expect(r.answer).toContain("**Adverse effects:**");
  });
  it("answers first-line treatment from the conditions list", () => {
    expect(findCondition("first line for hypertension")?.id).toBe("htn");
    const r = pharmReply("first-line drugs for hypertension")!;
    expect(r.answer).toContain("**First line**");
    expect(r.answer).toContain("used no credits");
  });
  it("leaves searches, quizzes and unknown drugs to the normal path", () => {
    expect(pharmReply("notes on lithium")).toBeNull();
    expect(pharmReply("10 mcqs on furosemide")).toBeNull();
    expect(pharmReply("dose of zzzquine")).toBeNull();
    expect(pharmReply("explain light's criteria")).toBeNull();
  });
});
