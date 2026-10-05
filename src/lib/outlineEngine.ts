// Course outlines for every year: the curated department outlines, plus a checklist for each library subject built
// from its lecture slides (so Years 1 and 2, which have no outline documents, get the same tick-off experience).
import { COURSE_OUTLINES, type CourseOutline, type OutlineDocument, type OutlineItem, type OutlineSection } from "@/data/courseOutlines";
import registry from "@/data/libraries.json";
import { loadLibrary, type LibraryNode } from "@/lib/libraryData";
import { prettyTitle } from "@/lib/libraryMeta";
import type { DriveFile } from "@/components/DriveFileViewer";

export const OUTLINE_YEARS = [1, 2, 3, 4, 6] as const;
const SKIP_SUBJECT = /other|unsorted|unnamed|bds|oral biology/i;
const OUTLINE_DOC = /outline|syllabus/i;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const curatedOutlines = (year: number) => COURSE_OUTLINES.filter((o) => o.year === year);

const allFiles = (n: LibraryNode, out: DriveFile[] = []): DriveFile[] => { n.f?.forEach((f) => out.push(f)); n.d?.forEach((c) => allFiles(c, out)); return out; };

function lectureSections(subject: LibraryNode, pattern: RegExp): { title: string; files: DriveFile[] }[] {
  const out: { title: string; files: DriveFile[] }[] = [];
  const process = (folder: LibraryNode, parent: string) => {
    const direct = folder.f ?? [];
    if (direct.length) out.push({ title: parent, files: direct });
    for (const sub of folder.d ?? []) out.push({ title: `${parent} — ${sub.n}`, files: allFiles(sub) });
  };
  const walk = (node: LibraryNode, name: string) => {
    for (const child of node.d ?? []) {
      if (pattern.test(child.n)) process(child, name);
      else walk(child, child.n);
    }
  };
  walk(subject, subject.n);
  return out;
}

/** A tick-off checklist from a subject's lecture slides (or its notes, when it has no slides). */
export function buildAutoOutline(year: number, subject: LibraryNode): CourseOutline | null {
  let raw = lectureSections(subject, /^lecture slides/i);
  let source = "lecture slides";
  if (!raw.some((s) => s.files.length)) { raw = lectureSections(subject, /^notes/i); source = "notes and handouts"; }
  const seen = new Set<string>();
  const sections: OutlineSection[] = [];
  for (const group of raw) {
    const items: OutlineItem[] = [];
    for (const file of [...group.files].sort((a, b) => collator.compare(a[1], b[1]))) {
      if (!["pdf", "ppt", "doc", "video"].includes(file[2]) || OUTLINE_DOC.test(file[1])) continue;
      const title = prettyTitle(file[1]);
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ id: `f-${file[0]}`, title, file: [file[0], file[1], file[2] as never] });
    }
    if (items.length) sections.push({ id: `a-${slug(group.title)}`, title: group.title, items });
  }
  if (!sections.length) return null;
  sections.sort((a, b) => collator.compare(a.title, b.title));
  const documents: OutlineDocument[] = allFiles(subject)
    .filter((f) => OUTLINE_DOC.test(f[1]) && ["pdf", "doc", "ppt"].includes(f[2]))
    .filter((f, i, arr) => arr.findIndex((g) => prettyTitle(g[1]).toLowerCase() === prettyTitle(f[1]).toLowerCase()) === i)
    .filter((f) => !f[1].startsWith("~$"))
    .map((f) => ({ label: prettyTitle(f[1]), fileId: f[0], name: f[1] }));
  return {
    id: `y${year}-${subject.s}`, year, auto: true, department: subject.n,
    title: `Year ${year} ${subject.n} — study checklist`,
    summary: `Every ${source} file in ${subject.n}, in one tick-off list. Open a file to read it here, tick it when you are done, and flag the topics you find hard.`,
    librarySlugs: [subject.s], documents, sections,
  };
}

const libFile = (year: number) => registry.libraries.find((l) => l.year === year)?.dataFile;

/** Curated outlines first, then a checklist for every library subject that has no curated outline. */
export async function loadYearOutlines(year: number): Promise<CourseOutline[]> {
  const curated = curatedOutlines(year);
  const file = libFile(year);
  if (!file) return curated;
  try {
    const lib = await loadLibrary(file);
    const covered = new Set(curated.flatMap((o) => o.librarySlugs ?? []));
    const autos = lib.d.filter((s) => !SKIP_SUBJECT.test(s.n) && !covered.has(s.s)).map((s) => buildAutoOutline(year, s)).filter((o): o is CourseOutline => Boolean(o));
    return [...curated, ...autos];
  } catch { return curated; }
}

export async function findOutline(id: string): Promise<CourseOutline | null> {
  const curated = COURSE_OUTLINES.find((o) => o.id === id);
  if (curated) return curated;
  const m = id.match(/^y(\d)-(.+)$/);
  if (!m) return null;
  return (await loadYearOutlines(Number(m[1]))).find((o) => o.id === id) ?? null;
}

/** Lower-cased file names of a year's library, so a topic only offers "Find notes" when matches exist. */
export async function libraryFileNames(year: number): Promise<string[]> {
  const file = libFile(year);
  if (!file) return [];
  const lib = await loadLibrary(file).catch(() => null);
  return lib ? lib.d.flatMap((n) => allFiles(n)).map((f) => f[1].toLowerCase()) : [];
}
