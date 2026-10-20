import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { buildBlogPath } from "@/lib/store";
import { cleanTopicTitle } from "../../supabase/functions/_shared/topicTitle.js";
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

export interface NavTarget { title: string; sub?: string; to: string }

/** Swipe left for the next note, right for the previous one (only for a clear horizontal swipe that does not start in a table, code block or picture). */
function useSwipeNav(prev: NavTarget | null, next: NavTarget | null) {
  const navigate = useNavigate();
  useEffect(() => {
    let sx = 0, sy = 0, t0 = 0, ok = false;
    const down = (e: TouchEvent) => {
      const el = e.target as HTMLElement | null;
      ok = !!el && !el.closest("table, pre, code, input, textarea, [data-no-swipe], .overflow-x-auto, img, [role=dialog]") && e.touches.length === 1;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; t0 = Date.now();
    };
    const up = (e: TouchEvent) => {
      if (!ok) return; ok = false;
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Date.now() - t0 > 700 || Math.abs(dx) < 110 || Math.abs(dy) > Math.abs(dx) * 0.5) return;
      const go = dx < 0 ? next : prev;
      if (go) navigate(go.to);
    };
    document.addEventListener("touchstart", down, { passive: true });
    document.addEventListener("touchend", up, { passive: true });
    return () => { document.removeEventListener("touchstart", down); document.removeEventListener("touchend", up); };
  }, [prev, next, navigate]);
}

/** Previous and next as two plain, large rows (no boxes), with the swipe gesture behind them. */
export function NoteNav({ prev, next }: { prev: NavTarget | null; next: NavTarget | null }) {
  useSwipeNav(prev, next);
  if (!prev && !next) return null;
  const row = (t: NavTarget, dir: "prev" | "next") => (
    <Link to={t.to} className={`group flex items-center gap-3 py-4 ${dir === "next" ? "flex-row-reverse text-right" : ""}`}>
      {dir === "prev" ? <ArrowLeft className="h-5 w-5 shrink-0 text-primary" aria-hidden /> : <ArrowRight className="h-5 w-5 shrink-0 text-primary" aria-hidden />}
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-primary">{dir === "prev" ? "Previous" : "Next"}</span>
        <span className="mt-0.5 line-clamp-2 block font-serif text-[17px] font-bold leading-snug group-hover:text-primary">{t.title}</span>
        {t.sub && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{t.sub}</span>}
      </span>
    </Link>
  );
  return (
    <nav aria-label="Previous and next note" className="mt-12 divide-y divide-border border-y border-border print:hidden">
      {next && row(next, "next")}
      {prev && row(prev, "prev")}
      <p className="py-2 text-center text-[11px] text-muted-foreground sm:hidden">Swipe left for the next note, right for the previous</p>
    </nav>
  );
}

/** For the notes in the library (the static notes). */
export default function NoteNavCards({ slug }: { slug: string }) {
  const { prev, next } = useMemo(() => neighbours(slug), [slug]);
  const t = (n: StaticNote | null): NavTarget | null => (n ? { title: n.title, sub: n.group ?? n.unit, to: `/notes/${n.slug}` } : null);
  return <NoteNav prev={t(prev)} next={t(next)} />;
}

/** For the notes of the blog: the note before and after this one in the same unit, oldest first, so a series reads in order. */
export function ArticleNav({ id, category, createdAt }: { id: string; category: string; createdAt?: string | null }) {
  const [pair, setPair] = useState<{ prev: NavTarget | null; next: NavTarget | null }>({ prev: null, next: null });
  useEffect(() => {
    let on = true;
    void (async () => {
      try {
        const db = supabase as any;
        const base = () => db.from("articles").select("id,title,slug,category,created_at").eq("published", true).is("deleted_at", null).eq("category", category).not("title", "ilike", "%mcq%").not("title", "ilike", "%past paper%").not("title", "ilike", "%exam%");
        const me = createdAt ? { created_at: createdAt } : (await db.from("articles").select("created_at").eq("id", id).maybeSingle()).data;
        if (!me?.created_at) return;
        const [p, n] = await Promise.all([base().lt("created_at", me.created_at).order("created_at", { ascending: false }).limit(1), base().gt("created_at", me.created_at).order("created_at", { ascending: true }).limit(1)]);
        const t = (r: { id: string; title: string; slug: string | null; category: string } | undefined): NavTarget | null => (r ? { title: cleanTopicTitle(r.title), sub: r.category.replace(/^Years*ds*:s*/i, ""), to: buildBlogPath(r) } : null);
        if (on) setPair({ prev: t(p.data?.[0]), next: t(n.data?.[0]) });
      } catch { /* no neighbours */ }
    })();
    return () => { on = false; };
  }, [id, category, createdAt]);
  return <NoteNav prev={pair.prev} next={pair.next} />;
}
