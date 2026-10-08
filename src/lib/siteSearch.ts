// One search over the whole site: notes (database), the Drive course-work library, course-outline topics and the
// site's own pages. Every hit carries the exact place to open, so a click lands on that note, file or topic.
import registry from "@/data/libraries.json";
import { COURSE_OUTLINES } from "@/data/courseOutlines";
import { supabase } from "@/integrations/supabase/client";
import { flattenDrive, loadDriveNotes } from "@/lib/driveNotes";
import { buildBlogPath } from "@/lib/store";
import { globalSearch, type SearchFilters } from "@/lib/search";
import { loadLibrary, type LibraryNode } from "@/lib/libraryData";
import { libraryPath, prettyTitle } from "@/lib/libraryMeta";
import { loadSiteConfig } from "@/lib/siteConfig";

export type HitGroup = "Notes" | "Library files" | "Outline topics" | "MCQs & flashcards" | "Units" | "Pages" | "Stories";
export interface SiteHit {
  key: string;
  group: HitGroup;
  title: string;
  subtitle: string;
  href: string;
  score: number;
  snippet?: string;
  kind: string;
}
export const GROUP_ORDER: HitGroup[] = ["Notes", "Library files", "Outline topics", "Units", "MCQs & flashcards", "Pages", "Stories"];

/** Words to match and highlight: lower-cased, 2+ characters. */
export const queryTerms = (q: string) => q.toLowerCase().split(/[^a-z0-9]+/i).filter((t) => t.length >= 2);

const matchesAll = (haystack: string, terms: string[]) => terms.every((t) => haystack.includes(t));
const rank = (title: string, q: string, terms: string[]) => {
  const t = title.toLowerCase();
  let s = 0;
  if (t === q) s += 60;
  else if (t.startsWith(q)) s += 40;
  else if (t.includes(q)) s += 25;
  if (terms.every((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t))) s += 10;
  return s - Math.min(title.length, 120) / 120;
};

// ---------- site pages ----------
interface PageDef { title: string; href: string; words: string }
const PAGES: PageDef[] = [
  { title: "My dashboard", href: "/dashboard", words: "dashboard progress goal streak overview home" },
  { title: "Study map — every system, every discipline", href: "/study-map", words: "study map connected learning anatomy histology embryology physiology pathology pharmacology system cardiovascular respiratory" },
  { title: "Clinical reasoning simulator — ward-round cases", href: "/clinical", words: "clinical simulator ward round cases history examination differential diagnosis consultant emergency psychiatry medicine surgery paediatrics obstetrics" },
  { title: "Consultant interrogation", href: "/clinical/consultant", words: "consultant rapid fire questions hints clinical" },
  { title: "Pharmacology — drug library, cancer drugs and conditions", href: "/pharmacology", words: "pharmacology drugs chemotherapy cancer drugs oncology doxorubicin cisplatin methotrexate vincristine tamoxifen imatinib first line hypertension diabetes asthma interactions adverse effects" },
  { title: "Cancer drugs — chemotherapy classes, regimens and toxicities", href: "/pharmacology?tab=cancer", words: "cancer chemotherapy cytotoxic alkylating anthracycline platinum taxane vinca antimetabolite regimens ABVD R-CHOP FOLFOX tumour lysis neutropenic sepsis" },
  { title: "First-line drugs by condition", href: "/pharmacology?tab=conditions", words: "first line treatment drugs condition hypertension diabetes heart failure tb hiv malaria epilepsy depression gout anaemia pre-eclampsia sepsis anaphylaxis" },
  { title: "Pharmacology practice drills", href: "/pharmacology?tab=practice", words: "pharmacology quiz adverse effect drug interactions name endings suffix pregnancy" },
  { title: "Must-knows for every Year 4 unit", href: "/must-knows", words: "must know high yield internal medicine surgery obstetrics gynaecology paediatrics psychiatry pharmacology radiology revision checklist" },
  { title: "Daily dose — five questions a day", href: "/daily", words: "daily questions streak quiz" },
  { title: "Mistakes notebook", href: "/clinical/mistakes", words: "mistakes wrong answers review notebook" },
  { title: "OSCE circuit — timed clinical stations", href: "/clinical/osce", words: "osce circuit timed stations history examination counselling clinical" },
  { title: "ECG and imaging stations", href: "/clinical/stations", words: "ecg xray x-ray cxr ct ultrasound imaging stations interpret describe" },
  { title: "Why ladders — physiology reasoning", href: "/clinical/why", words: "why ladder physiology pathophysiology reasoning" },
  { title: "Ward-round traps", href: "/clinical/traps", words: "traps mistakes ward round consultant lecturers" },
  { title: "Drug reasoning — class, mechanism, adverse effects", href: "/clinical/drugs", words: "drug pharmacology mechanism adverse effects dose" },
  { title: "Normal or abnormal? Examination reporting", href: "/clinical/findings", words: "normal abnormal examination findings report" },
  { title: "Rapid-fire clinical quiz", href: "/clinical/quiz", words: "quiz questions mcq sba clinical rapid fire" },
  { title: "Counselling stations", href: "/clinical/counsel", words: "counselling communication bad news hiv consent suicide" },
  { title: "Ward tools — calculators, scores and normal values", href: "/clinical/tools", words: "calculator gcs curb-65 wells parkland anion gap edd normal values ranges" },
  { title: "Clinical recall cards — if you see this, think these", href: "/clinical/cards", words: "recall cards flashcards pattern recognition clinical" },
  { title: "Reverse clinical reasoning", href: "/clinical/reason", words: "finding mechanism system diseases differentials backwards" },
  { title: "Smart revision", href: "/revise", words: "revision revise spaced review timer pomodoro focus streak flagged" },
  { title: "Revision planner", href: "/revision-planner", words: "planner plan schedule exam" },
  { title: "My revision", href: "/my-revision", words: "my revision saved progress" },
  { title: "Exams", href: "/exams", words: "exams timed mcq practice test" },
  { title: "Mega contest", href: "/contests", words: "contest competition leaderboard quiz" },
  { title: "Flashcards", href: "/flashcards", words: "flashcards cards memorise recall" },
  { title: "Essays", href: "/essays", words: "essays saq laq long answer" },
  { title: "Study notes (all years)", href: "/blog", words: "notes blog articles study" },
  { title: "Download the app", href: "/download-app", words: "app apk android download install" },
  { title: "About", href: "/about", words: "about founder contact abongo" },
  ...[1, 2, 3, 4, 5, 6].map((y) => ({ title: `Year ${y} — all study resources`, href: `/year/${y}`, words: `year ${y} home hub` })),
  ...[1, 2, 3, 4, 5, 6].map((y) => ({ title: `Year ${y} timetable`, href: `/timetable/year-${y}`, words: `timetable schedule classes lectures venue lecturer year ${y}` })),
  ...[1, 2, 3, 4].map((y) => ({ title: `Year ${y} course outlines & checklists`, href: `/course-outlines/year-${y}`, words: `course outline syllabus checklist tracker progress year ${y}` })),
  ...registry.libraries.map((l) => ({ title: `${l.label} library — books, slides, past papers`, href: libraryPath(l), words: `library files books textbooks slides past papers ${l.label} ${l.tagline}` })),
];

function pageHits(q: string, terms: string[]): SiteHit[] {
  return PAGES.filter((p) => matchesAll(`${p.title} ${p.words}`.toLowerCase(), terms)).map((p) => ({
    key: `page-${p.href}`, group: "Pages" as const, title: p.title, subtitle: p.href, href: p.href, kind: "page", score: 15 + rank(p.title, q, terms),
  }));
}

// ---------- course outline topics ----------
function outlineHits(q: string, terms: string[]): SiteHit[] {
  const out: SiteHit[] = [];
  for (const o of COURSE_OUTLINES) for (const s of o.sections) for (const i of s.items) {
    if (!matchesAll(`${i.title} ${i.detail ?? ""}`.toLowerCase(), terms)) continue;
    out.push({ key: `topic-${i.id}`, group: "Outline topics", title: i.title, subtitle: `Year ${o.year} · ${o.department} · ${s.title}`, href: `/course-outlines/${o.id}#${encodeURIComponent(i.id)}`, kind: "topic", score: 20 + rank(i.title, q, terms) });
  }
  return out;
}

// ---------- library files ----------
interface FileRow { id: string; name: string; lower: string; kind: string; where: string; href: string; year: number }
let fileIndex: Promise<FileRow[]> | null = null;

function loadFileIndex(): Promise<FileRow[]> {
  if (!fileIndex) {
    fileIndex = Promise.all(registry.libraries.map(async (def) => {
      const rows: FileRow[] = [];
      try {
        const lib = await loadLibrary(def.dataFile);
        const walk = (nodes: LibraryNode[], names: string[], slugs: string[]) => {
          for (const n of nodes) {
            const here = [...names, n.n];
            const hereSlugs = [...slugs, n.s];
            for (const f of n.f ?? []) rows.push({ id: f[0], name: f[1], lower: `${prettyTitle(f[1])} ${f[1]}`.toLowerCase(), kind: f[2], where: `${def.label} › ${here.join(" › ")}`, href: `${libraryPath(def, hereSlugs)}?file=${encodeURIComponent(f[0])}`, year: def.year });
            if (n.d) walk(n.d, here, hereSlugs);
          }
        };
        walk(lib.d, [], []);
      } catch { /* a library that fails to load is skipped */ }
      return rows;
    })).then((all) => all.flat());
    fileIndex.catch(() => { fileIndex = null; });
  }
  return fileIndex;
}

/** The live notes folder on Drive (see api/drive-notes.js), so new notes can be found the moment they are added. */
async function liveRows(): Promise<FileRow[]> {
  try {
    const d = await loadDriveNotes();
    if (!d.ok) return [];
    return flattenDrive(d.tree).map((r) => ({ id: r.file[0], name: r.file[1], lower: `${prettyTitle(r.file[1])} ${r.file[1]}`.toLowerCase(), kind: r.file[2], where: `Latest notes${r.where.length ? ` › ${r.where.join(" › ")}` : ""}`, href: `/new-notes?file=${encodeURIComponent(r.file[0])}`, year: 0 }));
  } catch { return []; }
}

async function fileHits(q: string, terms: string[], year?: number | null): Promise<SiteHit[]> {
  const [rows0, cfg, live] = await Promise.all([loadFileIndex(), loadSiteConfig(), year ? Promise.resolve([] as FileRow[]) : liveRows()]);
  const rows = [...rows0, ...live];
  const hidden = new Set(cfg.hiddenFiles);
  const out: SiteHit[] = [];
  for (const r of rows) {
    if ((year && r.year !== year) || hidden.has(r.id) || !matchesAll(r.lower, terms)) continue;
    const title = cfg.renames[r.id] ?? prettyTitle(r.name);
    out.push({ key: `file-${r.id}`, group: "Library files", title, subtitle: `${r.kind === "ppt" ? "Slides" : r.kind === "pdf" ? "PDF" : r.kind === "video" ? "Video" : r.kind === "img" ? "Image" : "Document"} · ${r.where}`, href: r.href, kind: r.kind, score: 30 + rank(title, q, terms) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 40);
}

// ---------- database: notes, MCQs, flashcards, units ----------
const GROUP_OF: Record<string, HitGroup> = { article: "Notes", mcq: "MCQs & flashcards", flashcard: "MCQs & flashcards", unit: "Units", topic: "Units", story: "Stories" };

async function dbHits(query: string, filters: SearchFilters): Promise<{ hits: SiteHit[]; related: string[] }> {
  try {
    const res = await globalSearch(query, filters);
    const hl = encodeURIComponent(query.trim());
    return {
      related: res.related,
      hits: res.hits.map((h) => ({
        key: `${h.kind}-${h.id}`, group: GROUP_OF[h.kind] ?? "Notes", title: h.title, subtitle: [h.category, h.contentType].filter(Boolean).join(" · "),
        href: h.kind === "article" ? `${h.href}${h.href.includes("?") ? "&" : "?"}hl=${hl}` : h.href, kind: h.kind, score: 50 + h.score / 4,
      })),
    };
  } catch { return { hits: [], related: [] }; }
}

const stripHtml = (html: string) => html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/** Notes whose body (not just title) mentions the words, with the sentence around the first match. */
async function contentHits(query: string, terms: string[], skip: Set<string>, year?: number | null): Promise<SiteHit[]> {
  const needle = query.trim().replace(/[,%]/g, " ");
  if (needle.length < 3) return [];
  try {
    let q = supabase.from("articles").select("id, title, slug, category, content").eq("published", true).is("deleted_at", null).ilike("content", `%${needle}%`).limit(14);
    if (year) q = q.ilike("category", `Year ${year}:%`);
    const { data } = await q;
    const out: SiteHit[] = [];
    for (const row of data ?? []) {
      if (skip.has(`article-${row.id}`) || row.category === "Stories") continue;
      const text = stripHtml(String(row.content ?? ""));
      const at = text.toLowerCase().indexOf(needle.toLowerCase());
      const snippet = at >= 0 ? `${at > 70 ? "…" : ""}${text.slice(Math.max(0, at - 70), at + needle.length + 120)}…` : undefined;
      out.push({ key: `article-${row.id}`, group: "Notes", title: row.title, subtitle: `${row.category} · found in the note`, href: `${buildBlogPath(row)}?hl=${encodeURIComponent(needle)}`, kind: "article", score: 40, snippet });
    }
    return out;
  } catch { return []; }
}

export interface SiteSearchOptions { year?: string; contentType?: string; deep?: boolean }

export async function siteSearch(query: string, opts: SiteSearchOptions = {}): Promise<{ hits: SiteHit[]; related: string[] }> {
  const q = query.trim().toLowerCase();
  const terms = queryTerms(query);
  if (q.length < 2 || !terms.length) return { hits: [], related: [] };
  const yearNum = Number(String(opts.year ?? "").match(/\d+/)?.[0]) || null;
  const filters: SearchFilters = { year: opts.year || undefined, contentType: opts.contentType || undefined };

  const [db, files] = await Promise.all([dbHits(query, filters), opts.contentType ? Promise.resolve([] as SiteHit[]) : fileHits(q, terms, yearNum)]);
  const local = opts.contentType ? [] : [...outlineHits(q, terms), ...pageHits(q, terms)].filter((h) => !yearNum || !/Year \d/.test(h.subtitle) || h.subtitle.includes(`Year ${yearNum}`));
  let deep: SiteHit[] = [];
  if (opts.deep) deep = await contentHits(query, terms, new Set(db.hits.map((h) => h.key)), yearNum);

  const seen = new Set<string>();
  const hits = [...db.hits, ...deep, ...files, ...local].filter((h) => (seen.has(h.key) ? false : (seen.add(h.key), true))).sort((a, b) => b.score - a.score);
  return { hits, related: db.related };
}

export function groupSiteHits(hits: SiteHit[]): { group: HitGroup; rows: SiteHit[] }[] {
  return GROUP_ORDER.map((group) => ({ group, rows: hits.filter((h) => h.group === group) })).filter((g) => g.rows.length);
}
