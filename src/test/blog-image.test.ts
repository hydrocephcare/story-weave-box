import { describe, expect, it } from "vitest";
import { isPaperTitle, looksLikeScan, tileColors, usableImage } from "@/lib/blogImage";

describe("which picture a blog may wear", () => {
  it("never uses a scanned exam page or a camera file", () => {
    expect(looksLikeScan("https://cdn.ompathstudy.com/uploads/2026/08/b52442a8-bchem-eoy-2015-page-001-19335f51.jpg")).toBe(true);
    expect(looksLikeScan("https://cdn.example.com/IMG_20260101_1234.jpg")).toBe(true);
    expect(looksLikeScan("https://cdn.example.com/whatsapp-image-2026.jpg")).toBe(true);
    expect(looksLikeScan("https://upload.wikimedia.org/wikipedia/commons/a/a1/Kidney_PioM.png")).toBe(false);
  });

  it("does not give a past paper a picture", () => {
    expect(isPaperTitle("bchem EOY 2015 — Past Paper Questions & Answers")).toBe(true);
    expect(isPaperTitle("Bacteriology and Entomology Supplementary Exam")).toBe(true);
    expect(isPaperTitle("Renal Anatomy and Physiology")).toBe(false);
    expect(usableImage({ title: "bchem EOY 2015 — Past Paper", og_image_url: "https://upload.wikimedia.org/x/Kidney.png", content: "" })).toBe("");
  });

  it("uses the page's own good picture, and skips a bad first one", () => {
    const wiki = "https://upload.wikimedia.org/wikipedia/commons/a/a1/Kidney_PioM.png";
    expect(usableImage({ title: "Renal Anatomy", og_image_url: wiki, content: "" })).toBe(wiki);
    expect(usableImage({ title: "Renal Anatomy", og_image_url: "", content: `![page](https://cdn.x.com/p-page-003.jpg)\n\n![kidney](${wiki})` })).toBe(wiki);
    expect(usableImage({ title: "Renal Anatomy", og_image_url: "", content: "no pictures" })).toBe("");
  });

  it("gives a tile its own colours", () => {
    const [a, b] = tileColors({ title: "Renal Anatomy", category: "Year 2: Physiology" });
    expect(a).toMatch(/^hsl\(/);
    expect(b).toMatch(/^hsl\(/);
  });
});
