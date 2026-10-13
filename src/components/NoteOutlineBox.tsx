import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, ChevronRight } from "lucide-react";
import { COURSE_OUTLINES, getCourseOutlineForUnit, type CourseOutline, type OutlineItem } from "@/data/courseOutlines";

interface Ref { outline: CourseOutline; items: { item: OutlineItem; section: string }[] }

/** Where a note sits in the course outline: the topics that link to it, or at least the outline for its unit. */
export function outlineRefFor(note: { slug: string; year: number; unit: string }): Ref | null {
  const direct = new Map<string, Ref>();
  for (const outline of COURSE_OUTLINES) for (const sec of outline.sections) for (const item of sec.items) {
    if (item.noteSlug !== note.slug) continue;
    const r = direct.get(outline.id) ?? { outline, items: [] };
    r.items.push({ item, section: sec.title });
    direct.set(outline.id, r);
  }
  const first = [...direct.values()][0];
  if (first) return first;
  const outline = getCourseOutlineForUnit(note.year, { name: note.unit, slug: note.unit.toLowerCase().replace(/[^a-z0-9]+/g, "-") });
  return outline ? { outline, items: [] } : null;
}

const weekOf = (w?: string) => { const m = String(w ?? "").match(/\d+(\s*[-–]\s*\d+)?/); return m ? `Wk ${m[0].replace(/\s+/g, "")}` : ""; };

/** One short line at the top of a note: the week it is taught this semester, with an arrow to the outline, or "No outline" when there is none. */
export default function NoteOutlineBox({ note }: { note: { slug: string; year: number; unit: string } }) {
  const ref = useMemo(() => outlineRefFor(note), [note]);
  const row = "mt-4 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm print:hidden";
  if (!ref) return <p className={`${row} border-border bg-muted/40 text-muted-foreground`}><ClipboardList className="h-4 w-4 shrink-0" aria-hidden /> No outline for this note</p>;
  const { outline, items } = ref;
  const wk = items.map((x) => weekOf(x.item.week)).filter(Boolean);
  const label = wk.length ? `${[...new Set(wk)].slice(0, 2).join(", ")} this semester` : "In this semester's outline";
  const to = items[0] ? `/course-outlines/${outline.id}#${encodeURIComponent(items[0].item.id)}` : `/course-outlines/${outline.id}`;
  return (
    <Link to={to} aria-label={`${label}. Open the course outline`} className={`${row} group border-primary/25 bg-primary/5 hover:bg-primary/10`}>
      <ClipboardList className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1 font-bold text-foreground">{label}<span className="ml-2 font-medium text-muted-foreground">{outline.title}</span></span>
      <ChevronRight className="h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
