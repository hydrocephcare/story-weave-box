import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { mdToHtml } from "../lib/miniMarkdown.js";
import registry from "../data/staticNotes.json";

// Faults found in the Ascites note, kept from coming back in any note (this runs in every build). The same rules, with automatic repair, are in scripts/imed/lint-notes.mjs.
const DIR = "src/content/notes";
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".md"));
const list = (Array.isArray(registry) ? registry : (registry as { notes?: unknown[] }).notes ?? Object.values(registry)) as { slug: string; title: string; file?: string }[];
const BEDSIDE = /examination|bedside|approach-to|cns-foundations/i;
const TABLE_OK =/differential|investigation|compar|versus|\bvs\b|classification|staging|grading|criteria|score/i;

describe("notes keep the quality rules", () => {
  it("every note title line matches its title in the registry", () => {
    const bad: string[] = [];
    for (const n of list) {
      if (!n.file || !fs.existsSync(n.file)) continue;
      const first = fs.readFileSync(n.file, "utf8").split(/\r?\n/).find((l) => l.trim()) ?? "";
      if (/^#\s/.test(first) && first.replace(/^#\s+/, "").trim() !== n.title) bad.push(`${path.basename(n.file)}: ${first}`);
    }
    expect(bad).toEqual([]);
  });

  it("tables appear only for differentials, investigations and comparisons, and none is longer than 12 rows", () => {
    const bad: string[] = [];
    for (const f of files) {
      if (BEDSIDE.test(f)) continue; // bedside examination and viva notes lay out findings, signs and lesions in tables on purpose, so they are left out of this rule
      const lines = fs.readFileSync(path.join(DIR, f), "utf8").split(/\r?\n/);
      let heading = "";
      for (let i = 0; i < lines.length; i++) {
        const h = lines[i].match(/^#{2,4}\s+(.*)$/);
        if (h) heading = h[1];
        if (/^\s*\|/.test(lines[i]) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")) {
          let j = i;
          while (j < lines.length && /^\s*\|/.test(lines[j])) j++;
          if (!TABLE_OK.test(heading) || j - i - 2 > 12) bad.push(`${f}: table under "${heading}" (${j - i - 2} rows)`);
          i = j - 1;
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("no note shows raw ** marks, a <br>, an empty label or a wiped-out lab threshold", () => {
    const bad: string[] = [];
    for (const f of files) {
      const text = fs.readFileSync(path.join(DIR, f), "utf8");
      const html = mdToHtml(text, { skipTitle: true, questions: true }).html;
      if (/\*\*/.test(html.replace(/<[^>]+>/g, " "))) bad.push(`${f}: stray **`);
      if (/<br\s*\/?>/i.test(text.replace(/^\s*\|.*$/gm, ""))) bad.push(`${f}: <br> in the text`);
      if (/^\s*[-*]\s+\*{4}/m.test(text)) bad.push(`${f}: empty bold label`);
      if (/the protocol dose\s*\/\s*(g|dl|l)\b|[<>≥]\s*the protocol dose/i.test(text)) bad.push(`${f}: a lab threshold became "the protocol dose"`);
    }
    expect(bad).toEqual([]);
  });
});

describe("the note renderer", () => {
  it("keeps a numbered list together across blank lines and a table, and keeps indented answers in their item", () => {
    const html = mdToHtml("1. **One**\n   - a\n\n2. **Two**\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\n3. **Three**\n   *model answer*\n").html;
    expect(html).toContain('<ol start="3">');
    expect(html).toContain("<li><strong>One</strong><ul><li>a</li></ul></li><li><strong>Two</strong></li>");
    expect(html).toContain("<strong>Three</strong><br /><em>model answer</em>");
  });
  it("renders bold that has italic inside it", () => {
    expect(mdToHtml("**If it grows *E. coli* what next?**").html).toBe("<p><strong>If it grows <em>E. coli</em> what next?</strong></p>");
  });
});

describe("note descriptions (shown under the title and in Google)", () => {
  it("none repeats its own title, runs on from a template, or stops half-way", () => {
    const bad = list.filter((n) => { const d = String((n as unknown as { description?: string }).description ?? ""); return /the complete clinical approach to/i.test(d) || /\(including\.?$/.test(d.trim()) || d.split(n.title).length > 2; }).map((n) => n.slug);
    expect(bad).toEqual([]);
  });
});

describe("practice questions become tappable cards", () => {
  it("every '### Question N' block that has A. B. C. D. options is rendered as a question card with its answer behind a button", () => {
    const bad: string[] = [];
    for (const f of files) {
      const text = fs.readFileSync(path.join(DIR, f), "utf8").replace(/\r\n/g, "\n");
      const blocks = text.split(/^###\s+Question\s+\d+\s*$/im).slice(1).filter((b) => /^\s*A\.\s/m.test(b) && /^\s*B\.\s/m.test(b) && /answer/i.test(b));
      if (!blocks.length) continue;
      const html = mdToHtml(text, { skipTitle: true, questions: true }).html;
      const cards = (html.match(/class="qa qa-mcq"/g) ?? []).length;
      const answers = (html.match(/class="qa-ans"/g) ?? []).length;
      if (cards < blocks.length || answers < blocks.length) bad.push(`${f}: ${blocks.length} questions, ${cards} cards, ${answers} hidden answers`);
    }
    expect(bad).toEqual([]);
  });
});
