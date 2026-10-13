import { describe, expect, it } from "vitest";
import { scanFirst } from "@/lib/blogFix";

const pages = "![p1](https://cdn.example.com/a-1.jpg)\n\n![p2](https://cdn.example.com/a-2.jpg)";

describe("scanFirst", () => {
  it("shows the scanned pages instead of reading noise", () => {
    const a = { title: "bchem EOY 2015 — Past Paper Questions & Answers", content: "# Biochemistry EOY 2015 — Visual Scan Archive\n\nnoise noise", original_notes: pages };
    const out = scanFirst(a);
    expect(out.content).toContain("![p1]");
    expect(out.content).toContain("![p2]");
    expect(out.content).not.toContain("noise");
    expect(out.content.startsWith("## bchem EOY 2015")).toBe(true);
  });
  it("leaves a normal note alone", () => {
    const a = { title: "Heart", content: "## Heart\n\nA real note.", original_notes: pages };
    expect(scanFirst(a)).toBe(a);
  });
  it("keeps the text when there are no page pictures", () => {
    const a = { title: "x", content: "Visual Scan Archive text", original_notes: "" };
    expect(scanFirst(a)).toBe(a);
  });
});
