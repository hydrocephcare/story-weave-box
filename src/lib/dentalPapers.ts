// Dental past papers: typed up from scanned papers (the scans themselves are never published). Each paper is a small JSON file under src/content/dental, and
// src/data/dentalPapers.json lists them. Questions come first; model answers are added later, paper by paper.

export interface PaperPart { l: string; text: string; marks?: number }
export interface PaperItem {
  /** h = section heading, q = a numbered question, p = a plain line (instruction, note) */
  t: "h" | "q" | "p";
  n?: string;
  text: string;
  marks?: number;
  parts?: PaperPart[];
}
export interface PaperPage { n: number; items: PaperItem[]; footer?: string }
export interface DentalPaper {
  slug: string;
  title: string;
  university: string;
  school: string;
  department: string;
  programme: string;
  examTitle: string;
  unitCode: string;
  unitTitle: string;
  date: string;
  sitting: string;
  duration: string;
  instructions: string;
  paperLabel?: string;
  pages: PaperPage[];
  complete: boolean;
  note?: string;
}
export interface PaperMeta { slug: string; title: string; unitCode: string; unitTitle: string; programme: string; date: string; year: string; sitting: string; duration: string; questions: number; complete: boolean; university: string; group: string }

import index from "@/data/dentalPapers.json";
export const PAPER_INDEX = index as PaperMeta[];

const files = import.meta.glob("../content/dental/*.json", { import: "default" }) as Record<string, () => Promise<DentalPaper>>;
export const loadPaper = async (slug: string): Promise<DentalPaper | null> => { const f = files[`../content/dental/${slug}.json`]; return f ? f() : null; };

export const questionCount = (p: DentalPaper) => p.pages.reduce((n, pg) => n + pg.items.filter((i) => i.t === "q").length, 0);
export const totalMarks = (p: DentalPaper) => p.pages.reduce((n, pg) => n + pg.items.reduce((m, i) => m + (i.t !== "q" ? 0 : i.parts?.length ? i.parts.reduce((x, q) => x + (q.marks ?? 0), 0) + (i.marks ?? 0) : i.marks ?? 0), 0), 0);
export const paperPath = (slug: string) => `/dental/papers/${slug}`;
