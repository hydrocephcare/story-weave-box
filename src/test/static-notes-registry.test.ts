import { readdirSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STATIC_NOTES } from "@/data/staticNotes";

// A note added to src/content/notes (by hand, by Lovable or by ChatGPT) is invisible until it is also listed in staticNotes.json.
// This test fails the build when one of the two is forgotten, so a published note can never silently go missing.
describe("static notes registry", () => {
  const files = readdirSync("src/content/notes").filter((f) => f.endsWith(".md"));

  it("lists every note file", () => {
    const listed = new Set(STATIC_NOTES.map((n) => n.file.split("/").pop()));
    const missing = files.filter((f) => !listed.has(f));
    expect(missing, `add these files to src/data/staticNotes.json: ${missing.join(", ")}`).toEqual([]);
  });

  it("points every entry at a file that exists, with the fields a note page needs", () => {
    for (const n of STATIC_NOTES) {
      expect(existsSync(n.file), `${n.slug}: ${n.file}`).toBe(true);
      expect(n.title && n.description && n.unit && n.year && /^\d{4}-\d{2}-\d{2}$/.test(n.updated), n.slug).toBeTruthy();
    }
  });

  it("has unique slugs", () => {
    const slugs = STATIC_NOTES.map((n) => n.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("an unlisted (SEO-only) note opens by its address but is not in the lists the site shows", async () => {
    const { STATIC_NOTES, findStaticNote } = await import("@/data/staticNotes");
    const all = (await import("@/data/staticNotes.json")).default as { slug: string; unlisted?: boolean }[];
    for (const n of all.filter((x) => x.unlisted)) { expect(STATIC_NOTES.some((x) => x.slug === n.slug)).toBe(false); expect(findStaticNote(n.slug)?.slug).toBe(n.slug); }
    expect(STATIC_NOTES.length + all.filter((x) => x.unlisted).length).toBe(all.length);
  });
});
