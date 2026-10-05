// Study notes that ship with the site, written as markdown in src/content/notes/ (not content-drafts/, which Vercel ignores).
// To add one:
//   1. put the .md file in src/content/notes/
//   2. add an entry to staticNotes.json (slug, year, unit, group, title, description, updated, file)
// That is all: the text is loaded on demand when someone opens the note, and the build also writes each note
// as a plain HTML page and adds it to the sitemap, so Google can read the full text.
import meta from "./staticNotes.json";

/** A past paper published as a note: when it was sat, which trimester that falls in, and which outline topics it tested. */
export interface PaperMeta {
  /** Unit code as printed on the paper, e.g. "MBOG 4212". */
  code: string;
  /** "CAT", "CAT 2", "End-of-year main exam"… */
  kind: string;
  /** Sitting date: "2019-12-13", "2018-11" when only the month is printed, or null when the paper carries no date. */
  sat: string | null;
  /** The sitting as shown to readers: "13 December 2019", "November 2018", "Undated". */
  satLabel: string;
  /** MKU trimester by the timetable: 1 = Sept–Dec, 2 = Jan–Apr, 3 = May–Aug. null when the paper is undated. */
  trimester: 1 | 2 | 3 | null;
  /** What the paper itself says it is, when that differs from the timetable (e.g. "End of 3rd semester"). */
  printed?: string;
  mcq: number;
  saq: number;
  /** False when pages are missing from the scan. */
  complete: boolean;
  missing?: string;
  /** Id of the course outline the topics belong to (src/data/courseOutlines.ts). */
  outline: string;
  /** Outline item ids this paper tested, so each unit can show what has been asked and what has not. */
  topics: string[];
  source: string;
  /** Google Drive file the paper was read from, when it came from the library. */
  driveId: string | null;
}

export interface StaticNote { slug: string; year: number; unit: string; group?: string; /** id of the matching condition in the pharmacology guide */ condition?: string; title: string; description: string; updated: string; file: string; paper?: PaperMeta }

export const STATIC_NOTES = meta as StaticNote[];

export type PaperNote = StaticNote & { paper: PaperMeta };
export const PAPER_NOTES = STATIC_NOTES.filter((n): n is PaperNote => Boolean(n.paper));
/** The trimester a date falls in: Sept–Dec = 1, Jan–Apr = 2, May–Aug = 3. */
export const trimesterOf = (d: Date): 1 | 2 | 3 => { const m = d.getMonth() + 1; return m >= 9 ? 1 : m <= 4 ? 2 : 3; };
export const TRIMESTER_LABEL: Record<number, string> = { 1: "Trimester 1 · September to December", 2: "Trimester 2 · January to April", 3: "Trimester 3 · May to August" };
export const driveViewUrl = (id: string) => `https://drive.google.com/file/d/${id}/view`;

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
