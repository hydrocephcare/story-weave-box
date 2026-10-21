// Dental past papers: typed up from scanned papers (the scans themselves are never published). Each paper is a small JSON file under src/content/dental, and
// src/data/dentalPapers.json lists them. Questions come first; model answers are added later, paper by paper.

export interface PaperPart { l: string; text: string; marks?: number; parts?: PaperPart[] }
export interface PaperItem {
  /** h = section heading, q = a numbered question, p = a plain line (instruction, note) */
  t: "h" | "q" | "p";
  n?: string;
  /** unique anchor inside the paper (a question number can repeat across sections) */
  id?: string;
  text: string;
  marks?: number;
  parts?: PaperPart[];
}
export interface PaperPage { n: number; items: PaperItem[]; footer?: string }
export interface DentalPaper {
  slug: string;
  title: string;
  dateLabel?: string;
  category?: string;
  categorySlug?: string;
  unitSlug?: string;
  programmes?: string[];
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
export interface PaperMeta { section: string; unitSlug: string; categorySlug: string; programmes: string[]; dateISO: string; slug: string; title: string; unitCode: string; unitTitle: string; programme: string; date: string; year: string; sitting: string; duration: string; questions: number; complete: boolean; university: string; group: string }

import index from "@/data/dentalPapers.json";
import cats from "@/data/dentalCategories.json";
export const PAPER_INDEX = index as PaperMeta[];

const files = import.meta.glob("../content/dental/*.json", { import: "default" }) as Record<string, () => Promise<DentalPaper>>;
export const loadPaper = async (slug: string): Promise<DentalPaper | null> => { const f = files[`../content/dental/${slug}.json`]; return f ? f() : null; };

export const questionCount = (p: DentalPaper) => p.pages.reduce((n, pg) => n + pg.items.filter((i) => i.t === "q").length, 0);
const partMarks = (parts?: PaperPart[]): number => (parts ?? []).reduce((n, p) => n + (p.marks ?? 0) + partMarks(p.parts), 0);
export const totalMarks = (p: DentalPaper) => p.pages.reduce((n, pg) => n + pg.items.reduce((m, i) => m + (i.t !== "q" ? 0 : partMarks(i.parts) + (i.marks ?? 0)), 0), 0);

/** The subject categories, units and programmes found in the published papers (for the browse pages and menus). */
export const CATEGORY_LIST = Array.from(new Map(PAPER_INDEX.map((p) => [p.categorySlug, p.group])).entries()).map(([slug, name]) => ({ slug, name, papers: PAPER_INDEX.filter((x) => x.categorySlug === slug).length, units: Array.from(new Map(PAPER_INDEX.filter((x) => x.categorySlug === slug).map((x) => [x.unitSlug, x.unitTitle])).entries()).map(([us, ut]) => ({ slug: us, title: ut, papers: PAPER_INDEX.filter((x) => x.unitSlug === us).length })) }));
export const categoryBlurb: Record<string, string> = Object.fromEntries((cats as { slug: string; blurb: string }[]).map((c) => [c.slug, c.blurb]));
const SECTION_OF = new Map(PAPER_INDEX.map((p) => [p.slug, p.section]));
/** Every address in the papers area starts with the paper's own section: /dental, /it, /business, /hospitality, /social or /science. */
export const paperPath = (slug: string) => `/${SECTION_OF.get(slug) ?? "dental"}/papers/${slug}`;
export const unitPath = (section: string, unitSlug: string) => `/${section}/units/${unitSlug}`;
export const categoryPath = (section: string, cat: string) => `/${section}/category/${cat}`;
