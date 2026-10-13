import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, ChevronRight } from "lucide-react";
import { matchOutline, outlineLine, useOutlineDocs } from "@/lib/outlineSync";

/**
 * One line that says where a page sits in the course: "Year 4 · Semester 2 · Week 5 · Internal Medicine · Dr X".
 * It appears only when the page matches a row of an outline the admin has added; otherwise it renders nothing.
 */
export default function OutlineLine({ title, year, unit, className = "" }: { title: string; year?: number | null; unit?: string; className?: string }) {
  const docs = useOutlineDocs();
  const m = useMemo(() => (docs.length ? matchOutline(docs, { title, year, unit }) : null), [docs, title, year, unit]);
  if (!m) return null;
  return (
    <Link to={`/course-outlines/year-${m.doc.year}`} className={`group flex items-start gap-2.5 text-sm text-foreground/85 print:hidden ${className}`} aria-label={`In the course outline: ${outlineLine(m)}. Open the outline`}>
      <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1"><span className="font-semibold text-foreground">{outlineLine(m)}</span>{m.row.detail ? <span className="block text-xs text-muted-foreground">{m.row.detail}</span> : null}</span>
      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
