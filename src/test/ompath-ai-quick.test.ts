import { describe, expect, it } from "vitest";
import { cacheKey, quickReply } from "@/lib/ompathAiQuick";

describe("quickReply", () => {
  it("answers small talk", () => {
    for (const s of ["hi", "Hello!", "hey there", "Asante", "thanks", "who are you?", "help"]) expect(quickReply(s), s).not.toBeNull();
  });
  it("leaves study questions alone", () => {
    for (const s of ["hi, explain nephrotic syndrome", "notes on psychiatry", "what is hypertension", "psychiatry"]) expect(quickReply(s), s).toBeNull();
  });
});

describe("cacheKey", () => {
  it("matches rewordings of the same question", () => {
    expect(cacheKey("Psych notes")).toBe(cacheKey("i need notes on psychiatry!"));
  });
  it("separates different topics", () => {
    expect(cacheKey("notes on asthma")).not.toBe(cacheKey("notes on copd"));
  });
});

describe("typos", () => {
  it("reads a misspelt topic as the real one", () => {
    expect(cacheKey("phyciaty")).toBe(cacheKey("psychiatry"));
    expect(cacheKey("pharmcology notes")).toBe(cacheKey("pharmacology notes"));
  });
});
