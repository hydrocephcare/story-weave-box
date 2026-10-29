// Sorts the notes of one unit into the topics of that unit's course outline ("Surgical oncology", "Hernias", "Wound healing"), so 70 notes read as a syllabus
// instead of one long list. Pure functions: the matching is by the words of the note title against the topic and its subtopics.
import { COURSE_OUTLINES, type CourseOutline } from "@/data/courseOutlines";

const STOP = new Set(["and", "the", "of", "in", "for", "with", "notes", "note", "study", "guide", "revision", "year", "mcqs", "mcq", "essay", "questions", "principles", "basic", "introduction", "management", "disease", "diseases", "clinical", "approach", "to", "a", "on", "its", "after", "before", "surgery", "surgical", "surgeon", "presentation", "complications", "complication", "assessment", "features", "types", "causes", "diagnosis", "treatment", "children", "paediatric", "pediatric"]);
// the first six letters stand for the word, so "oesophageal" and "oesophagus", or "carcinoma" and "carcinomas", count as the same word
const stem = (w: string) => w.slice(0, 6);
const SYNONYM: Record<string, string> = { hernia: "hernia", cancer: "carcin", malign: "carcin", tumour: "oncolo", tumor: "oncolo", neopla: "oncolo" };
const tokens = (s: string): string[] => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => SYNONYM[stem(w)] ?? stem(w));
const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");

/** The curated outline for a category such as "Year 4: Surgery", if there is one. */
export function outlineForUnit(category: string | null | undefined): CourseOutline | null {
  const m = /^year\s*(\d)\s*:\s*(.+)$/i.exec(category ?? "");
  if (!m) return null;
  const year = Number(m[1]), name = norm(m[2]);
  return COURSE_OUTLINES.find((o) => o.year === year && !o.auto && (norm(o.department).includes(name) || name.includes(norm(o.department)))) ?? null;
}

export interface TopicGroup<T> { id: string; title: string; items: T[] }

/** Puts each note under the outline section it fits best; notes that fit none go to "Other notes". Sections without notes are left out. */
export function groupByTopic<T extends { title: string }>(notes: T[], outline: CourseOutline): TopicGroup<T>[] {
  const sections = outline.sections.map((s) => ({
    s,
    title: new Set(tokens(s.title.split("·").pop() || s.title)),
    items: s.items.map((i) => new Set(tokens(i.title))),
  }));
  const buckets = new Map<string, T[]>();
  const other: T[] = [];
  for (const n of notes) {
    const t = tokens(n.title);
    const exact = sections.find((x) => norm(n.title) === norm(x.s.title.split("·").pop() || x.s.title));
    if (exact) { buckets.set(exact.s.id, [...(buckets.get(exact.s.id) ?? []), n]); continue; }
    if (!t.length) { other.push(n); continue; }
    let best: { id: string; score: number } | null = null;
    for (const sec of sections) {
      // every word of the topic name in the title is a strong match; otherwise the best subtopic overlap
      const titleHit = sec.title.size ? [...sec.title].filter((w) => t.includes(w)).length / sec.title.size : 0;
      let itemHit = 0;
      for (const it of sec.items) if (it.size) itemHit = Math.max(itemHit, [...it].filter((w) => t.includes(w)).length / it.size);
      // a topic with no words left (all generic) cannot be matched by words; a note counts for a subtopic only through its own words
      const score = Math.max(sec.title.size ? titleHit * 1.1 : 0, itemHit);
      if (score >= 0.5 && (!best || score > best.score)) best = { id: sec.s.id, score };
    }
    if (best) buckets.set(best.id, [...(buckets.get(best.id) ?? []), n]); else other.push(n);
  }
  const groups: TopicGroup<T>[] = sections.filter((x) => buckets.has(x.s.id)).map((x) => ({ id: x.s.id, title: x.s.title.split("·").pop()!.trim(), items: buckets.get(x.s.id)! }));
  if (other.length) groups.push({ id: "other", title: "Other notes in this unit", items: other });
  return groups;
}
