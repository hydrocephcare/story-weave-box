import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowUp } from "lucide-react";

const LONG_PAGE = /^\/(notes|topic|blog|essays|mcqs)\/[^/]+/;

/**
 * Two small helpers for long pages: a thin bar at the very top that fills as you read, and a "back to top" button that appears once you
 * have scrolled a long way. They stay out of the way: no bar on short pages, no button until it is useful, and neither is printed.
 */
export default function PageHelpers() {
  const { pathname } = useLocation();
  const [progress, setProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);
  const long = LONG_PAGE.test(pathname);

  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const h = document.documentElement;
      const max = h.scrollHeight - window.innerHeight;
      setProgress(max > 600 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
      setShowTop(window.scrollY > 1400);
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [pathname]);

  return (
    <>
      {long && progress > 0 && <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] bg-transparent print:hidden" aria-hidden><div className="h-full origin-left bg-primary transition-[width] duration-100" style={{ width: `${progress * 100}%` }} /></div>}
      {showTop && (
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top" className="fixed bottom-24 left-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-lg backdrop-blur transition hover:border-primary/60 hover:text-primary print:hidden sm:bottom-6">
          <ArrowUp className="h-5 w-5" aria-hidden />
        </button>
      )}
    </>
  );
}
