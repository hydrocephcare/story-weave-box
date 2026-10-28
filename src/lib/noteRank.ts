// Ranking and grouping of search results. A student looking for "perioperative care" wants, in this order: the subject's own notes in the unit they mean,
// then lecturers' slides and PDFs for that unit, then papers and question banks, then related pages from other units. This file works out which unit is meant
// and sorts the results that way. Pure functions, no network.
import { getCategoryDisplayName } from "@/lib/store";

export interface RankInput { id: string; title: string; category?: string | null; meta_description?: string | null; tags?: string[] | null; content_type?: string | null; source_type?: string | null; updated_at?: string; created_at?: string }
export type NoteKind = "note" | "slides" | "papers";

/** A past paper, MCQ bank or CAT; a lecturer's slides, PDF or Drive import; or an ordinary note (the ones written on the site, by hand or with the AI). */
export function noteKind(a: Pick<RankInput, "title" | "content_type" | "source_type" | "tags">): NoteKind {
  const typeAndTitle = `${a.content_type || ""} ${a.title || ""}`;
  if (/past paper|mcq bank|mcqs? & question|\bCAT\b|continuous assessment|\bspot|supplementary|end[- ]of[- ]year|exam questions|question bank/i.test(typeAndTitle)) return "papers";
  if (/^google_drive/i.test(a.source_type || "") || /lecture materials|lecture slides|\bslides?\b|presentation|\bpptx?\b|\.pdf|handout/i.test(`${typeAndTitle} ${(a.tags || []).join(" ")}`)) return "slides";
  return "note";
}

/** Words in a search that point to a unit before any result is looked at. */
const UNIT_HINTS: [RegExp, string][] = [
  [/\bsurg(?:ery|ical|eon)\b|\bperi-?operative\b|\bpost-?operative\b|\bpre-?operative\b|\bintra-?operative\b|\boperative\b|\bwound\b|\bhernia\b|\bburns?\b/i, "Surgery"],
  [/\bobstetric|\bgynae|\bgynec|\bpregnan|\blabou?r\b|\bantenatal|\bpuerper|\bmiscarriage|\babortion\b/i, "Obstetrics and Gynaecology"],
  [/\bpaediatric|\bpediatric|\bchild(?:ren)?\b|\bneonat|\binfant/i, "Paediatrics"],
  [/\binternal medicine\b|\bmedicine\b/i, "Internal Medicine"],
];

const words = (q: string) => q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 1);

/** How well a result matches the search: the whole phrase in the title counts most, then the words in the title, tags, description and unit. */
export function scoreResult(a: RankInput, query: string): number {
  const q = query.trim().toLowerCase();
  const ws = words(q);
  if (!ws.length) return 0;
  const title = (a.title || "").toLowerCase(), cat = (a.category || "").toLowerCase(), meta = (a.meta_description || "").toLowerCase(), tags = (a.tags || []).join(" ").toLowerCase();
  let s = 8; // it matched at all (title, description or the text of the note)
  if (title.includes(q)) s += 100;
  s += (ws.filter((w) => title.includes(w)).length / ws.length) * 60;
  if (ws.every((w) => title.includes(w))) s += 30;
  if (tags.includes(q)) s += 25;
  if (meta.includes(q)) s += 20; else s += (ws.filter((w) => meta.includes(w)).length / ws.length) * 10;
  if (cat.includes(q)) s += 15;
  return s;
}

export interface UnitCluster { category: string; name: string; count: number; score: number }
export interface ResultGroup<T> { key: string; label: string; items: T[] }
export interface Ranked<T> { primary: string | null; primaryName: string; clusters: UnitCluster[]; groups: ResultGroup<T>[] }

/** The unit a search is about: the one chosen on the page, else a unit word in the search, else the unit that holds the strongest results. */
export function detectUnit<T extends RankInput>(results: T[], query: string, chosen?: string | null): { primary: string | null; clusters: UnitCluster[] } {
  const by = new Map<string, UnitCluster>();
  for (const r of results) {
    const cat = r.category || "";
    if (!cat) continue;
    const c = by.get(cat) ?? { category: cat, name: getCategoryDisplayName(cat), count: 0, score: 0 };
    c.count++; c.score += scoreResult(r, query);
    by.set(cat, c);
  }
  const hint = UNIT_HINTS.find(([re]) => re.test(query))?.[1];
  const clusters = [...by.values()].map((c) => (hint && c.category.toLowerCase().includes(hint.toLowerCase()) ? { ...c, score: c.score + 60 } : c)).sort((a, b) => b.score - a.score);
  if (chosen) return { primary: chosen, clusters };
  const top = clusters[0];
  const total = clusters.reduce((n, c) => n + c.score, 0) || 1;
  // a unit is only assumed when it clearly leads (a third of all the matching strength, or a unit word was typed)
  return { primary: top && (top.score / total >= 0.34 || hint) ? top.category : null, clusters };
}

/** Sorts and groups results: the unit's own notes, its slides and PDFs, its papers, then everything else. */
export function rankResults<T extends RankInput>(results: T[], query: string, chosenUnit?: string | null): Ranked<T> {
  const { primary, clusters } = detectUnit(results, query, chosenUnit);
  const scored = results.map((r) => ({ r, s: scoreResult(r, query), kind: noteKind(r) }));
  const order = (a: { s: number; r: T }, b: { s: number; r: T }) => b.s - a.s || new Date(b.r.updated_at || b.r.created_at || 0).getTime() - new Date(a.r.updated_at || a.r.created_at || 0).getTime();
  const pick = (f: (x: (typeof scored)[number]) => boolean) => scored.filter(f).sort(order).map((x) => x.r);
  const name = primary ? getCategoryDisplayName(primary) : "";
  const inUnit = (x: (typeof scored)[number]) => !primary || x.r.category === primary;
  const groups: ResultGroup<T>[] = primary
    ? [
        { key: "notes", label: `Notes in ${name}`, items: pick((x) => inUnit(x) && x.kind === "note") },
        { key: "slides", label: `Lecture slides and PDFs in ${name}`, items: pick((x) => inUnit(x) && x.kind === "slides") },
        { key: "papers", label: `Papers, MCQ banks and CATs in ${name}`, items: pick((x) => inUnit(x) && x.kind === "papers") },
        { key: "other", label: "Related, from other units and years", items: pick((x) => !inUnit(x)) },
      ]
    : [
        { key: "notes", label: "Notes", items: pick((x) => x.kind === "note") },
        { key: "slides", label: "Lecture slides and PDFs", items: pick((x) => x.kind === "slides") },
        { key: "papers", label: "Papers, MCQ banks and CATs", items: pick((x) => x.kind === "papers") },
      ];
  return { primary, primaryName: name, clusters, groups: groups.filter((g) => g.items.length) };
}

/** A student sees their own year and the years below it, never the years above. Pages that belong to no year are for everyone. */
export function visibleToYear(category: string | null | undefined, myYear: number | null | undefined): boolean {
  if (!myYear) return true;
  const m = String(category ?? "").match(/\byear\s*([1-6])\b/i);
  return !m || Number(m[1]) <= myYear;
}
