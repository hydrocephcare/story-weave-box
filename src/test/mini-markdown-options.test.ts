import { describe, expect, it } from "vitest";
import { inlineOptions, mdToHtml } from "@/lib/miniMarkdown.js";

describe("options written on one line", () => {
  it("are split into lettered options", () => {
    const o = inlineOptions("A. Ovary · **B. Fallopian tube (ampulla)** · C. Cervix · D. Abdominal cavity · E. Caesarean scar");
    expect(o).toHaveLength(5);
    expect(o[1]).toEqual(["B", "Fallopian tube (ampulla)"]);
  });
  it("leave ordinary lines alone", () => {
    expect(inlineOptions("A. a single option")).toBeNull();
    expect(inlineOptions("Some sentence · with a dot")).toBeNull();
  });
  it("make a tappable question out of the note format", () => {
    const md = "**1.** The commonest site of ectopic pregnancy is:\nA. Ovary · **B. Fallopian tube (ampulla)** · C. Cervix · D. Abdominal cavity · E. Caesarean scar\n*Answer: B. About 98% are tubal.*\n";
    const html: string = mdToHtml(md, { questions: true }).html;
    expect(html).toContain("qa-mcq");
    expect((html.match(/class="qa-opt"/g) ?? []).length).toBe(5);
    expect(html).toContain('data-correct="B"');
  });
});
