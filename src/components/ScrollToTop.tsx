import { useEffect, useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { flashAnchor } from "@/lib/deep-link";
import { clearNoteReturn, getNoteReturn } from "@/lib/noteReturn";

const SCROLL_KEY = "ompath_scroll_positions";

function readPositions(): Record<string, number> {
  try { return JSON.parse(sessionStorage.getItem(SCROLL_KEY) || "{}"); }
  catch { return {}; }
}

function savePosition(path: string, y: number) {
  try {
    const positions = readPositions();
    positions[path] = y;
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(positions));
  } catch { /* storage unavailable */ }
}

export default function ScrollToTop() {
  const { pathname, search, hash, state, key } = useLocation();
  const navigationType = useNavigationType();
  const currentPath = pathname + search;
  const entryKey = key || currentPath;
  useEffect(() => {
    const old = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => { window.history.scrollRestoration = old; };
  }, []);

  useEffect(() => {
    const path = entryKey;
    const save = () => savePosition(path, window.scrollY);
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", save);
    window.addEventListener("beforeunload", save);
    return () => {
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", save);
      window.removeEventListener("beforeunload", save);
      save();
    };
  }, [entryKey]);

  useLayoutEffect(() => {
    if (hash) {
      const frame = requestAnimationFrame(() => flashAnchor(hash.slice(1)));
      return () => cancelAnimationFrame(frame);
    }

    // Going Back, or following "Back to <note>", returns to where the reader was. Notes load and draw their text after the
    // page appears (a long note can take several seconds), so keep trying until the page is tall enough, and stop as soon
    // as the reader scrolls. The position recorded when the link was clicked is exact, so it wins over the saved one.
    const ret = getNoteReturn();
    const fromLink = Boolean(ret && ret.path === currentPath && (navigationType === "POP" || (state as { restore?: boolean } | null)?.restore));
    const isReload = typeof performance !== "undefined" && performance.getEntriesByType("navigation").some((entry) => (entry as PerformanceNavigationTiming).type === "reload");
    const positions = readPositions();
    const savedY = positions[entryKey] ?? positions[currentPath] ?? 0;
    const target = fromLink && ret ? ret.y : navigationType === "POP" || isReload ? savedY : 0;
    const startedAt = Date.now();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
      if (cancelled) return;
      window.scrollTo({ top: target, left: 0, behavior: "auto" });
      if (target > 0 && Math.abs(window.scrollY - target) > 4 && Date.now() - startedAt < 15000) { timer = setTimeout(attempt, 120); return; }
      if (fromLink) clearNoteReturn();
    };
    const stop = () => { cancelled = true; };
    const events = ["wheel", "touchmove", "keydown"] as const;
    if (target > 0) events.forEach((e) => window.addEventListener(e, stop, { passive: true, once: true }));
    const frame = requestAnimationFrame(attempt);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, stop));
    };
  }, [currentPath, entryKey, hash, navigationType]);

  return null;
}
