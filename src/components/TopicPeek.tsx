import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Maximize2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { loadPeek, topicPeek, useTopicPeekSlug, type Peek } from "@/lib/topicPeek";
import { setNoteReturn } from "@/lib/noteReturn";

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
  const origin = useRef<{ path: string; title: string; y: number } | null>(null);

  useEffect(() => { const mq = window.matchMedia("(min-width: 768px)"); const on = () => setWide(mq.matches); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, []);
  useEffect(() => {
    if (!slug) return;
    // remember exactly where the reader was, before anything on screen moves
    origin.current = { path: `${window.location.pathname}${window.location.search}`, title: document.title.split(" | ")[0].split(" — ")[0] || "where you were", y: window.scrollY };
    let on = true;
    setPeek(null);
    void loadPeek(slug).then((p) => on && setPeek(p)).catch(() => on && setPeek({ slug, name: slug.replace(/-/g, " "), category: "", summary: "", points: [], image: null }));
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

  const go = () => {
    if (!slug) return;
    if (origin.current) setNoteReturn(origin.current);
    topicPeek.close();
    navigate(`/topic/${slug}`);
  };

  return (
    <Sheet open={Boolean(slug)} onOpenChange={(o) => !o && topicPeek.close()}>
      <SheetContent side={wide ? "right" : "bottom"} className={wide ? "flex h-full w-[28rem] max-w-full flex-col gap-0 p-0 sm:max-w-md" : "flex h-[82dvh] flex-col gap-0 rounded-t-3xl p-0"}>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-6" data-peek-scroll>
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
              {!peek.summary && !peek.points.length && <p className="mt-4 text-[15px] text-muted-foreground">Open the full page to read about {peek.name}.</p>}
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
