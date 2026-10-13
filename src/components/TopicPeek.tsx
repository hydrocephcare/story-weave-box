import { lazy, Suspense, useEffect, useRef, useState } from "react";
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
const DrugPeekBody = lazy(() => import("@/components/DrugPeekBody"));

export default function TopicPeekHost() {
  const raw = useTopicPeekSlug();
  const drugId = raw?.startsWith("drug:") ? raw.slice(5) : null;
  const slug = drugId ? null : raw;
  const navigate = useNavigate();
  const [peek, setPeek] = useState<Peek | null>(null);
  const [wide, setWide] = useState(typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : false);
  const [filling, setFilling] = useState(false);
  const origin = useRef<{ path: string; title: string; y: number } | null>(null);

  useEffect(() => { const mq = window.matchMedia("(min-width: 768px)"); const on = () => setWide(mq.matches); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, []);
  useEffect(() => {
    if (drugId) origin.current = { path: `${window.location.pathname}${window.location.search}`, title: document.title.split(" | ")[0].split(" — ")[0] || "where you were", y: window.scrollY };
  }, [drugId]);
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
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a.topic-link, a[data-drug]") as HTMLAnchorElement | null;
      if (!a) return;
      const drug = a.dataset.drug;
      const m = a.getAttribute("href")?.match(/^\/topic\/([a-z0-9-]+)$/);
      if (!drug && !m) return;
      // stop everything else from also following the link: the panel opens, the page does not
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (drug) topicPeek.openDrug(drug); else topicPeek.open(m![1]);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Scrolled back up to the top? Keep pulling down (phone) or scrolling up (computer) and the panel closes itself, so there is no X to hunt for.
  const [atTop, setAtTop] = useState(true);
  const pull = useRef({ y: 0, wheel: 0 });
  const scroller = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setAtTop(true); pull.current = { y: 0, wheel: 0 }; }, [raw, peek]);
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => { const top = e.currentTarget.scrollTop <= 1; setAtTop(top); if (!top) pull.current.wheel = 0; };
  // Closing the panel must never move the page behind it: a fast pull leaves momentum that would carry the page to the top,
  // so the page is held at the spot it was at for a moment after the panel goes.
  const placeY = useRef(0);
  const closeHere = () => {
    const y = origin.current?.y ?? placeY.current;
    topicPeek.close();
    let n = 0;
    const id = window.setInterval(() => { if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y); if (++n > 35) window.clearInterval(id); }, 20);
    const stop = () => window.clearInterval(id);
    window.addEventListener("touchstart", stop, { once: true, passive: true });
    window.addEventListener("wheel", stop, { once: true, passive: true });
  };
  const startedTop = useRef(false);
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => { pull.current.y = e.touches[0].clientY; startedTop.current = e.currentTarget.scrollTop <= 1; };
  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop > 1) { pull.current.y = e.touches[0].clientY; startedTop.current = false; return; }
    // only a deliberate pull that began at the top closes it, not a fling that happened to reach the top
    if (startedTop.current && e.touches[0].clientY - pull.current.y > 90) { pull.current.y = e.touches[0].clientY; closeHere(); }
  };
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < 0 && e.currentTarget.scrollTop <= 1) { pull.current.wheel += -e.deltaY; if (pull.current.wheel > 320) { pull.current.wheel = 0; closeHere(); } } else pull.current.wheel = 0;
  };

  // The panel gets its own history entry, so the phone's Back button closes it (and nothing moves behind it).
  const pushed = useRef(false);
  const afterBack = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (raw && !pushed.current) { try { window.history.pushState({ ompathPeek: true }, ""); pushed.current = true; } catch { /* ignore */ } }
    if (!raw && pushed.current) { pushed.current = false; if ((window.history.state as { ompathPeek?: boolean } | null)?.ompathPeek) window.history.back(); }
  }, [raw]);
  useEffect(() => {
    const onPop = () => {
      pushed.current = false;
      if (afterBack.current) { const f = afterBack.current; afterBack.current = null; f(); return; }
      if (current()) closeHere();
    };
    const current = () => document.querySelector("[data-peek-scroll]") !== null;
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = () => {
    if (!slug && !drugId) return;
    if (origin.current) setNoteReturn(origin.current);
    const target = drugId ? `/pharmacology/drug/${drugId}?card=1` : `/topic/${slug}`;
    const had = pushed.current && (window.history.state as { ompathPeek?: boolean } | null)?.ompathPeek;
    pushed.current = false;
    topicPeek.close();
    // step back over the panel's own history entry first, so Back from the full page returns to where you were
    if (had) { afterBack.current = () => navigate(target); window.history.back(); setTimeout(() => { if (afterBack.current) { afterBack.current = null; navigate(target); } }, 400); }
    else navigate(target);
  };

  return (
    <Sheet open={Boolean(raw)} onOpenChange={(o) => !o && closeHere()}>
      <SheetContent side={wide ? "right" : "bottom"} className={wide ? "flex h-full w-[28rem] max-w-full flex-col gap-0 p-0 sm:max-w-md" : "flex h-[82dvh] flex-col gap-0 rounded-t-3xl p-0"}>
        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 pb-4 pt-6 [-webkit-overflow-scrolling:touch]" data-peek-scroll ref={scroller} onScroll={onScroll} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onWheel={onWheel}>
          <div className="pointer-events-none -mt-3 mb-3 flex flex-col items-center" aria-hidden><span className="h-1 w-10 rounded-full bg-foreground/20" /><span className={`mt-1 text-[11px] font-semibold transition-opacity ${atTop ? "text-muted-foreground opacity-100" : "opacity-0"}`}>Pull down to close</span></div>
          {drugId ? (
            <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-muted" />}><DrugPeekBody id={drugId} /></Suspense>
          ) : peek ? (
            <>
              <p className="pr-8 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">{peek.category || "Quick read"}</p>
              <SheetTitle className="mt-1 pr-8 font-serif text-3xl font-bold leading-tight text-foreground">{peek.name}</SheetTitle>
              <SheetDescription className="sr-only">A short summary of {peek.name}</SheetDescription>
              {peek.image && <img src={peek.image.u} alt={peek.image.title} className="mt-4 max-h-44 w-full rounded-2xl border border-border bg-white object-contain" loading="lazy" />}
              {peek.summary && <p className="mt-4 text-[17px] leading-relaxed text-foreground/85">{peek.summary}</p>}
              {peek.points.length > 0 && (
                <ul className="mt-6 space-y-6">
                  {peek.points.map((p) => (
                    <li key={p.h}><p className="font-serif text-lg font-bold text-foreground">{p.h}</p><p className="mt-1 text-[16px] leading-relaxed text-foreground/80">{p.t}</p></li>
                  ))}
                </ul>
              )}
              {!peek.summary && !peek.points.length && (filling
                ? <div className="mt-5 space-y-3" role="status" aria-label="Loading" aria-live="polite">{[0, 1, 2, 3].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-foreground/10" style={{ width: `${96 - i * 9}%` }} />)}<div className="h-20 animate-pulse rounded-xl bg-foreground/10" /></div>
                : <p className="mt-4 text-[15px] text-muted-foreground">Open the full page to read about {peek.name}.</p>)}
            </>
          ) : (
            <div aria-busy="true"><div className="h-4 w-24 animate-pulse rounded bg-muted" /><div className="mt-3 h-8 w-2/3 animate-pulse rounded bg-muted" /><div className="mt-6 h-24 animate-pulse rounded-2xl bg-muted" /><div className="mt-4 h-16 animate-pulse rounded-xl bg-muted" /></div>
          )}
        </div>
        <div className="shrink-0 border-t border-border bg-background px-5 py-3">
          <button type="button" onClick={go} disabled={!peek && !drugId} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-[15px] font-bold text-primary-foreground disabled:opacity-60"><Maximize2 className="h-4 w-4" aria-hidden /> Open the full page</button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
