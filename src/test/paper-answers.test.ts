import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import notes from "@/data/staticNotes.json";
import { splitPaper } from "@/lib/paperAnswers";

const root = path.resolve(__dirname, "../..");
const papers = (notes as { slug: string; file: string; paper?: unknown }[]).filter((n) => n.paper);

describe("past papers: questions show, answers hide", () => {
  it("covers every published paper", () => {
    expect(papers.length).toBeGreaterThanOrEqual(16);
  });

  for (const n of papers) {
    it(`${n.slug}: no answer text is left in the visible part`, () => {
      const md = fs.readFileSync(path.join(root, n.file), "utf8");
      const parts = splitPaper(md);
      const visible = parts.filter((p) => !p.hidden).map((p) => p.text).join("\n");
      const hidden = parts.filter((p) => p.hidden);
      expect(hidden.length).toBeGreaterThan(0);
      // MCQ answers ("**Answer: C.**") and "### Answer" sections must never sit in the open part.
      expect(visible).not.toMatch(/^\*\*Answer[:.]/m);
      expect(visible).not.toMatch(/^#{2,4}\s+Answer\b/m);
      // Nothing is lost: question text plus answer text is the whole note.
      const squash = (t: string) => t.replace(/\s+/g, "");
      const kept = squash(parts.map((p) => p.text).join(""));
      const original = squash(md.replace(/^#{2,4}\s+Answer\s*$/gm, ""));
      expect(kept.length).toBeGreaterThan(original.length * 0.97);
    });
  }
});
