import { describe, expect, it } from "vitest";
import { joinTableRows } from "@/lib/tableRows";

describe("table rows", () => {
  it("joins rows separated by blank lines and leaves other text alone", () => {
    const t = "Intro\n\n| a | b |\n\n|---|---|\n\n| 1 | 2 |\n\nAfter";
    expect(joinTableRows(t)).toBe("Intro\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nAfter");
  });
});
