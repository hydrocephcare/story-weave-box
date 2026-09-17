import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowUp } from "lucide-react";

/**
 * Site-wide scroll progress bar + back-to-top button.
 *
 * Both are hidden on article pages (/blog/:slug) because BlogPost already ships
 * its own reading-progress bar and bottom-right progress dot, and on timed exam
 * screens where floating UI would interfere.
 */
function useHiddenPages() {
  const { pathname } = useLocation();
  return /^\/blog\/.+/.test(pathname) || /^\/exams\/[^/]+\/start/.test(pathname);
}

/* Thin gradient bar pinned to the very top of the viewport */
export function ScrollProgressBar() {
  const hidden = useHiddenPages();
  const [pct, setPct] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      if (raf.current) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        const doc = document.documentElement;
        const total = doc.scrollHeight - doc.clientHeight;
        setPct(total > 0 ? (doc.scrollTop / total) * 100 : 0);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  if (hidden) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]"
      aria-hidden
    >
      <div
        className="h-full origin-left bg-gradient-to-r from-primary via-primary/80 to-accent transition-[width] duration-100 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* Floating back-to-top button that appears after scrolling down */
export function BackToTopButton() {
  const hidden = useHiddenPages();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setVisible(window.scrollY > 640);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  if (hidden) return null;

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top"
      title="Back to top"
      className={`group fixed bottom-5 right-5 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-primary/20 bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <ArrowUp className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5" />
    </button>
  );
}
