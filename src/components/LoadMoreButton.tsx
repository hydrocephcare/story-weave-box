import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * "Load more" for any list that grows downward. It shows a short loading state, adds the next items, then glides down to the first new
 * one so the reader does not have to scroll to find what was just added. The list is the element just above the button (or above the
 * wrapper the button sits in); pass `list` if it is somewhere else.
 */
export default function LoadMoreButton({ onMore, className, children, delay = 450, list }: { onMore: () => void; className?: string; children: React.ReactNode; delay?: number; list?: () => Element | null }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const find = (): Element | null => list?.() ?? btn.current?.previousElementSibling ?? btn.current?.parentElement?.previousElementSibling ?? null;

  const click = () => {
    if (busy) return;
    const box = find();
    const before = box?.children.length ?? 0;
    setBusy(true);
    timers.current.push(window.setTimeout(() => {
      onMore();
      setBusy(false);
      // wait for the new items to be drawn, then glide to the first of them
      let tries = 0;
      const go = () => {
        const first = box?.children[before] as HTMLElement | undefined;
        if (!first) { if (tries++ < 12) timers.current.push(window.setTimeout(go, 50)); return; }
        first.style.scrollMarginTop = "88px";
        first.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
      };
      timers.current.push(window.setTimeout(go, 60));
    }, delay));
  };

  return (
    <button ref={btn} type="button" onClick={click} disabled={busy} aria-busy={busy} className={`${className ?? ""} disabled:cursor-wait`}>
      {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading…</> : children}
    </button>
  );
}
