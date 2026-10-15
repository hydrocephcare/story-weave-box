import fs from "node:fs";
import { describe, expect, it } from "vitest";
import notes from "@/data/staticNotes.json";

// Every note that ships with the site must be laid out the way the pages expect, so a note added by hand, by an AI or by another tool cannot
// silently break the page: a title, real sections, tables that have rows, and no raw AI leftovers.
const list = (notes as { slug: string; file: string; paper?: unknown; title: string }[]).filter((n) => !n.paper);

describe("static notes are well formed", () => {
  it.each(list.map((n) => [n.slug, n.file]))("%s", (_slug, file) => {
    const md = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    expect(md.length, "note is too short to be a note").toBeGreaterThan(1500);
    expect(/^#{1,2} \S/m.test(md), "no title or sections").toBe(true);
    expect((md.match(/^#{2,3} \S/gm) ?? []).length, "too few sections").toBeGreaterThanOrEqual(3);
    const runs = md.split("\n").reduce((a: number[], l) => { if (l.trim().startsWith("|")) a[a.length - 1] = (a[a.length - 1] ?? 0) + 1; else if (a[a.length - 1] !== 0) a.push(0); return a; }, [0]).filter((n) => n > 0);
    expect(runs.filter((n) => n < 3).length, "a table is cut off (needs a header, a separator and a row)").toBe(0);
    expect(/(^|\n)\s*(Sure[,!]|Certainly[,!]|Here is the|Here are the|As an AI)/i.test(md), "AI chat leftovers").toBe(false);
  });
});
