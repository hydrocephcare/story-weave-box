import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { STATIC_NOTES, findStaticNote, loadStaticNoteText, type StaticNote } from "@/data/staticNotes";
import { IMED, isPublished, topicForNote } from "@/data/imed";

/** The notes before and after this one, in reading order: the curriculum order for internal medicine, the order of the unit otherwise. */
function neighbours(slug: string): { prev: StaticNote | null; next: StaticNote | null } {
  const me = findStaticNote(slug);
  if (!me) return { prev: null, next: null };
  const here = topicForNote(slug);
  let order: StaticNote[];
  if (here) {
    order = IMED.flatMap((s) => s.topics).filter(isPublished).map((t) => (t.note ? findStaticNote(t.note) : null)).filter((n): n is StaticNote => Boolean(n)).filter((n, i, a) => a.findIndex((x) => x.slug === n.slug) === i);
  } else {
    order = STATIC_NOTES.filter((n) => !n.paper && n.unit === me.unit && n.group === me.group);
  }
  const i = order.findIndex((n) => n.slug === slug);
  return { prev: i > 0 ? order[i - 1] : null, next: i >= 0 ? order[i + 1] ?? null : null };
}

/** The first picture of a note (its text is loaded only when the card is on screen), so the card shows the note's own illustration. */
function useThumb(slug: string | undefined) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let on = true; setSrc(null);
    if (!slug) return;
    loadStaticNoteText(slug).then((t) => { const m = t.match(/!\[[^\]]*\]\((https?:[^)\s]+)\)/); if (on && m) setSrc(m[1]); }).catch(() => undefined);
    return () => { on = false; };
  }, [slug]);
  return src;
}

function Card({ note, dir }: { note: StaticNote; dir: "prev" | "next" }) {
  const src = useThumb(note.slug);
  const Icon = dir === "prev" ? ArrowLeft : ArrowRight;
  return (
    <Link to={`/notes/${note.slug}`} className={`group flex overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md ${dir === "next" ? "sm:flex-row-reverse sm:text-right" : ""}`}>
      <span className="relative h-auto w-28 shrink-0 overflow-hidden bg-gradient-to-br from-primary/25 via-primary/10 to-violet-400/20 sm:w-36">
        {src ? <img src={src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <span className="absolute inset-0 flex items-center justify-center font-serif text-4xl font-bold text-primary/40">{note.title.slice(0, 1)}</span>}
      </span>
      <span className="min-w-0 flex-1 p-4">
        <span className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-primary ${dir === "next" ? "sm:justify-end" : ""}`}>{dir === "prev" && <Icon className="h-3.5 w-3.5" aria-hidden />}{dir === "prev" ? "Previous" : "Up next"}{dir === "next" && <Icon className="h-3.5 w-3.5" aria-hidden />}</span>
        <span className="mt-1 line-clamp-2 block font-serif text-lg font-bold leading-snug group-hover:text-primary">{note.title}</span>
        <span className="mt-1 line-clamp-2 block text-[13px] leading-5 text-muted-foreground">{note.group ?? note.unit}</span>
      </span>
    </Link>
  );
}

export default function NoteNavCards({ slug }: { slug: string }) {
  const { prev, next } = useMemo(() => neighbours(slug), [slug]);
  if (!prev && !next) return null;
  return (
    <nav aria-label="Previous and next note" className="mt-12 grid gap-3 sm:grid-cols-2 print:hidden">
      {prev ? <Card note={prev} dir="prev" /> : <span className="hidden sm:block" />}
      {next ? <Card note={next} dir="next" /> : null}
    </nav>
  );
}
