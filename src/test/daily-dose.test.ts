import { describe, expect, it } from "vitest";
import { drugOfTheDay } from "@/pages/DailyDose";
import { ALL_PDRUGS } from "@/pharm";

describe("daily dose", () => {
  it("selects a real drug from the pharmacology library", () => {
    const drug = drugOfTheDay("2026-11-19");
    expect(drug).not.toBeNull();
    expect(ALL_PDRUGS.some((item) => item.id === drug?.id)).toBe(true);
  });

  it("keeps the featured drug stable throughout the same local date", () => {
    expect(drugOfTheDay("2026-11-19")?.id).toBe(drugOfTheDay("2026-11-19")?.id);
  });
});
