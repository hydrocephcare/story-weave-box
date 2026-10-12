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

/** "Course outline" card at the top of a note: the topic, week and lecturer, and one tap to the full outline and its official text. */
export default function NoteOutlineBox({ note }: { note: { slug: string; year: number; unit: string } }) {
  const ref = useMemo(() => outlineRefFor(note), [note]);
  if (!ref) return null;
  const { outline, items } = ref;
  const hasText = Boolean(outline.info?.length);
  return (
    <aside aria-label="Course outline" className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-3.5 print:hidden">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary"><ClipboardList className="h-3.5 w-3.5" /> Course outline · {outline.title}</p>
      {items.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {items.slice(0, 4).map(({ item, section }) => (
            <li key={item.id}>
              <Link to={`/course-outlines/${outline.id}#${encodeURIComponent(item.id)}`} className="group flex items-start gap-2 rounded-lg bg-background/70 px-2.5 py-2 hover:bg-background">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-snug text-foreground">{item.title}</span>
                  <span className="block text-xs text-muted-foreground">{[item.week, item.lecturer, section].filter(Boolean).join(" · ")}</span>
                </span>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold">
        <Link to={`/course-outlines/${outline.id}`} className="text-primary hover:underline">Open the course outline</Link>
        {hasText && <Link to={`/course-outlines/${outline.id}#course-outline`} className="text-primary hover:underline">Read the official outline text</Link>}
        <Link to={`/course-outlines/year-${note.year}`} className="text-primary hover:underline">All Year {note.year} outlines</Link>
      </p>
    </aside>
  );
}
