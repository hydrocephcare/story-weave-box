import { useEffect, useRef, useState } from "react";

/**
 * A sidebar that stays on screen while the page scrolls, so the rail is never blank next to a long page.
 * When the rail is taller than the window it scrolls with the page until its bottom is reached, then holds there.
 */
export default function StickyRail({ children, offset = 72, className = "" }: { children: React.ReactNode; offset?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(offset);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setTop(Math.min(offset, window.innerHeight - el.offsetHeight - 16));
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener("resize", update);
    return () => { ro?.disconnect(); window.removeEventListener("resize", update); };
  }, [offset]);

  return <div ref={ref} className={`sticky self-start ${className}`} style={{ top }}>{children}</div>;
}
