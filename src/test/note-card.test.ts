import { describe, expect, it } from "vitest";
import { noteCardTree } from "@/lib/noteCard.js";

const text = (n: unknown): string => (typeof n === "string" ? n : Array.isArray(n) ? n.map(text).join("|") : n && typeof n === "object" ? text((n as { props: { children?: unknown } }).props.children) : "");

describe("share card", () => {
  it("shows the title, year, unit and kind", () => {
    const t = text(noteCardTree({ title: "Pleural Effusion", year: "4", unit: "Internal Medicine", kind: "Notes", week: "Wk 3" }));
    for (const s of ["Pleural Effusion", "Year 4", "Internal Medicine", "NOTES", "Wk 3", "OMPATH STUDY"]) expect(t).toContain(s);
  });
  it("shortens a very long title and copes with nothing at all", () => {
    expect(text(noteCardTree({ title: "x ".repeat(200) }))).toContain("…");
    expect(text(noteCardTree({}))).toContain("Study notes");
  });
});
