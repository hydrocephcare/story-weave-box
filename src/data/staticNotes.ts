// Study notes that ship with the site, written as markdown in src/content/notes/ (not content-drafts/, which Vercel ignores).
// To add one:
//   1. put the .md file in src/content/notes/
//   2. add an entry to staticNotes.json (slug, year, unit, group, title, description, updated, file)
// That is all: the text is loaded on demand when someone opens the note, and the build also writes each note
// as a plain HTML page and adds it to the sitemap, so Google can read the full text.
import meta from "./staticNotes.json";

export interface StaticNote { slug: string; year: number; unit: string; group?: string; title: string; description: string; updated: string; file: string }

export const STATIC_NOTES: StaticNote[] = meta;

// Every markdown file under src/content/notes, as a lazy loader keyed by its path.
const files = import.meta.glob("../content/notes/*.md", { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;

export const notesForYear = (year: number) => STATIC_NOTES.filter((n) => n.year === year);
export const findStaticNote = (slug: string) => STATIC_NOTES.find((n) => n.slug === slug) ?? null;

export function loadStaticNoteText(slug: string): Promise<string> {
  const note = findStaticNote(slug);
  const loader = note ? files[`../content/notes/${note.file.split("/").pop()}`] : undefined;
  return loader ? loader() : Promise.reject(new Error("unknown note"));
}

/** Notes grouped for display: unit first, then topic group, in the order they were added. */
export function groupNotes(list: StaticNote[]) {
  const units: { unit: string; groups: { group: string; notes: StaticNote[] }[] }[] = [];
  for (const n of list) {
    let u = units.find((x) => x.unit === n.unit);
    if (!u) { u = { unit: n.unit, groups: [] }; units.push(u); }
    const g = n.group ?? "Notes";
    let grp = u.groups.find((x) => x.group === g);
    if (!grp) { grp = { group: g, notes: [] }; u.groups.push(grp); }
    grp.notes.push(n);
  }
  return units;
}
