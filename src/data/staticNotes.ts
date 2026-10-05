// Study notes that ship with the site, written as markdown in src/content/notes/ (not content-drafts/, which Vercel ignores). To add one:
//   1. put the .md file in src/content/notes/
//   2. add an entry to staticNotes.json (slug, year, unit, title, description, updated, file)
//   3. add its loader below, so the note is only downloaded when someone opens it.
// The build also writes each note as a plain HTML page, so Google can read the full text.
import meta from "./staticNotes.json";

export interface StaticNote { slug: string; year: number; unit: string; title: string; description: string; updated: string; file: string }

export const STATIC_NOTES: StaticNote[] = meta;

const loaders: Record<string, () => Promise<string>> = {
  "bipolar-and-related-disorders": () => import("../content/notes/psychiatry-bipolar-disorder.md?raw").then((m) => m.default),
};

export const notesForYear = (year: number) => STATIC_NOTES.filter((n) => n.year === year);
export const findStaticNote = (slug: string) => STATIC_NOTES.find((n) => n.slug === slug) ?? null;
export const loadStaticNoteText = (slug: string): Promise<string> => (loaders[slug] ? loaders[slug]() : Promise.reject(new Error("unknown note")));
