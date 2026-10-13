import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Maximize2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { enrichPeek, loadPeek, topicPeek, useTopicPeekSlug, type Peek } from "@/lib/topicPeek";
import { setNoteReturn } from "@/lib/noteReturn";
import { pageForPeek } from "@/lib/topics";

/**
 * The quick-read panel (mounted once, in App). It slides up on a phone and in from the side on a computer.
 * Tapping a highlighted word anywhere on the site opens it; "Open the full page" goes to the whole topic and leaves a
 * "Back to <where you were>" button at the same scroll position. The body scrolls on its own, with one close button (the X).
 */
export default function TopicPeekHost() {
  const slug = useTopicPeekSlug();
  const navigate = useNavigate();
  const [peek, setPeek] = useState<Peek | null>(null);
  const [wide, setWide] = useState(typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : false);
  const [filling, setFilling] = useState(false);
  const origin = useRef<{ path: string; title: string; y: number } | null>(null);

  useEffect(() => { const mq = window.matchMedia("(min-width: 768px)"); const on = () => setWide(mq.matches); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, []);
  useEffect(() => {
    if (!slug) return;
    // remember exactly where the reader was, before anything on screen moves
    origin.current = { path: `${window.location.pathname}${window.location.search}`, title: document.title.split(" | ")[0].split(" — ")[0] || "where you were", y: window.scrollY };
    let on = true;
    setPeek(null); setFilling(false);
    const blank: Omit<Peek, "names" | "written"> = { slug, name: slug.replace(/-/g, " ").replace(/\b([a-z])/g, (m) => m.toUpperCase()), category: "", summary: "", points: [], image: null };
    void loadPeek(slug).catch(() => ({ ...blank, names: [blank.name], written: false })).then(async (p0) => {
      if (!on) return;
      setPeek(p0);
      // the picture and any online introduction arrive a moment later, without moving what is already on screen
      const p = await enrichPeek(p0).catch(() => p0);
      if (!on) return;
      setPeek(p);
      // nothing written for this topic yet: it is prepared now, and the panel fills in when it is ready
      if (!p.written && !p.points.length) {
        setFilling(true);
        const page = await pageForPeek(slug, p.name, p.category).catch(() => null);
        if (!on) return;
        if (page) { const again = await loadPeek(slug).then((x) => enrichPeek(x)).catch(() => p); if (on) setPeek(again); }
        setFilling(false);
      }
    });
    return () => { on = false; };
  }, [slug]);

  // a link to a topic anywhere in a note opens the panel instead of leaving the page
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a.topic-link") as HTMLAnchorElement | null;
      const m = a?.getAttribute("href")?.match(/^\/topic\/([a-z0-9-]+)$/);
      if (!a || !m) return;
      e.preventDefault();
      topicPeek.open(m[1]);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Reached the end? Keep pulling (phone) or scrolling (computer) and the panel closes by itself, so there is no X to hunt for.
  const [atEnd, setAtEnd] = useState(false);
  const pull = useRef({ y: 0, dist: 0, wheel: 0 });
  const scroller = useRef<HTMLDivElement | null>(null);
  const reachedEnd = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight < 3;
  useEffect(() => { setAtEnd(false); pull.current = { y: 0, dist: 0, wheel: 0 }; }, [slug, peek]);
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => { const end = reachedEnd(e.currentTarget); setAtEnd(end); if (!end) pull.current.wheel = 0; };
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => { pull.current.y = e.touches[0].clientY; pull.current.dist = 0; };
  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (!reachedEnd(el)) { pull.current.y = e.touches[0].clientY; return; }
    pull.current.dist = Math.max(0, pull.current.y - e.touches[0].clientY);
    if (pull.current.dist > 70) { pull.current.dist = 0; topicPeek.close(); }
  };
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY > 0 && reachedEnd(e.currentTarget)) { pull.current.wheel += e.deltaY; if (pull.current.wheel > 260) { pull.current.wheel = 0; topicPeek.close(); } } else pull.current.wheel = 0;
  };

  const go = () => {
    if (!slug) return;
    if (origin.current) setNoteReturn(origin.current);
    topicPeek.close();
    navigate(`/topic/${slug}`);
  };

  return (
    <Sheet open={Boolean(slug)} onOpenChange={(o) => !o && topicPeek.close()}>
      <SheetContent side={wide ? "right" : "bottom"} className={wide ? "flex h-full w-[28rem] max-w-full flex-col gap-0 p-0 sm:max-w-md" : "flex h-[82dvh] flex-col gap-0 rounded-t-3xl p-0"}>
        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 pb-4 pt-6 [-webkit-overflow-scrolling:touch]" data-peek-scroll ref={scroller} onScroll={onScroll} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onWheel={onWheel}>
          {peek ? (
            <>
              <p className="pr-8 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">{peek.category || "Quick read"}</p>
              <SheetTitle className="mt-1 pr-8 font-serif text-3xl font-bold leading-tight text-foreground">{peek.name}</SheetTitle>
              <SheetDescription className="sr-only">A short summary of {peek.name}</SheetDescription>
              {peek.image && <img src={peek.image.u} alt={peek.image.title} className="mt-4 max-h-44 w-full rounded-2xl border border-border bg-white object-contain" loading="lazy" />}
              {peek.summary && <p className="mt-4 text-[17px] leading-relaxed text-foreground/85">{peek.summary}</p>}
              {peek.points.length > 0 && (
                <ul className="mt-4 space-y-3">
                  {peek.points.map((p) => (
                    <li key={p.h} className="rounded-xl bg-muted/60 p-3.5"><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{p.h}</p><p className="mt-1 text-[15px] leading-snug text-foreground/90">{p.t}</p></li>
                  ))}
                </ul>
              )}
              {(peek.points.length > 2 || peek.summary.length > 200) && <p className={`mt-5 pb-1 text-center text-xs font-semibold transition-colors ${atEnd ? "text-primary" : "text-muted-foreground/70"}`}>{atEnd ? "Keep pulling up to close" : "Scroll to the end, then keep going to close"}</p>}
              {!peek.summary && !peek.points.length && (filling
                ? <div className="mt-5 space-y-3" role="status" aria-label="Loading" aria-live="polite">{[0, 1, 2, 3].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-foreground/10" style={{ width: `${96 - i * 9}%` }} />)}<div className="h-20 animate-pulse rounded-xl bg-foreground/10" /></div>
                : <p className="mt-4 text-[15px] text-muted-foreground">Open the full page to read about {peek.name}.</p>)}
            </>
          ) : (
            <div aria-busy="true"><div className="h-4 w-24 animate-pulse rounded bg-muted" /><div className="mt-3 h-8 w-2/3 animate-pulse rounded bg-muted" /><div className="mt-6 h-24 animate-pulse rounded-2xl bg-muted" /><div className="mt-4 h-16 animate-pulse rounded-xl bg-muted" /></div>
          )}
        </div>
        <div className="shrink-0 border-t border-border bg-background px-5 py-3">
          <button type="button" onClick={go} disabled={!peek} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-[15px] font-bold text-primary-foreground disabled:opacity-60"><Maximize2 className="h-4 w-4" aria-hidden /> Open the full page</button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
