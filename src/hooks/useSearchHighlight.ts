import { useCallback, useEffect, useRef, useState } from "react";
import { queryTerms } from "@/lib/queryTerms";

type HighlightRegistry = { set: (name: string, h: unknown) => void; delete: (name: string) => void };
const registry = (): HighlightRegistry | null => (typeof CSS !== "undefined" && (CSS as unknown as { highlights?: HighlightRegistry }).highlights) || null;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Highlights the words a learner searched for (?hl=…) inside the opened note, using the CSS Custom Highlight API so
 * the note's own markup is never touched, and lets them step through the matches.
 */
export function useSearchHighlight(term: string | null, selector: string, ready: boolean) {
  const [count, setCount] = useState(0);
  const [index, setIndex] = useState(0);
  const [version, setVersion] = useState(0); // bumps whenever the ranges are rebuilt, so they are repainted
  const rangesRef = useRef<Range[]>([]);
  const scrolled = useRef(false);

  const compute = useCallback(() => {
    const root = term ? document.querySelector(selector) : null;
    const terms = term ? queryTerms(term) : [];
    if (!root || !terms.length) { rangesRef.current = []; setCount(0); return; }
    const phrase = term!.trim().toLowerCase();
    const re = new RegExp(`(${[phrase.length > 3 ? esc(phrase) : "", ...terms.map(esc)].filter(Boolean).join("|")})`, "gi");
    const ranges: Range[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && /^(SCRIPT|STYLE|NOSCRIPT)$/.test(n.parentElement.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = walker.nextNode(); n && ranges.length < 400; n = walker.nextNode()) {
      const text = n.nodeValue ?? "";
      re.lastIndex = 0;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        if (!m[0]) { re.lastIndex++; continue; }
        const r = document.createRange();
        r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
        ranges.push(r);
      }
    }
    rangesRef.current = ranges;
    setCount(ranges.length);
    setVersion((v) => v + 1);
    setIndex((i) => Math.min(i, Math.max(ranges.length - 1, 0)));
  }, [term, selector]);

  // Find the matches once the note has rendered, and again if the note's markup changes.
  useEffect(() => {
    scrolled.current = false;
    if (!term || !ready) return;
    const t = window.setTimeout(compute, 400);
    const root = document.querySelector(selector);
    let debounce = 0;
    const mo = root ? new MutationObserver(() => { window.clearTimeout(debounce); debounce = window.setTimeout(compute, 300); }) : null;
    if (root && mo) mo.observe(root, { childList: true, subtree: true, characterData: true });
    return () => { window.clearTimeout(t); window.clearTimeout(debounce); mo?.disconnect(); };
  }, [term, selector, ready, compute]);

  // Paint every match; the current one stands out and scrolls into view.
  useEffect(() => {
    const reg = registry();
    const Highlight = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
    const ranges = rangesRef.current;
    if (reg && Highlight) {
      if (ranges.length) {
        reg.set("search-hit", new Highlight(...ranges));
        reg.set("search-hit-current", new Highlight(ranges[Math.min(index, ranges.length - 1)]));
      } else { reg.delete("search-hit"); reg.delete("search-hit-current"); }
    }
    const current = ranges[Math.min(index, ranges.length - 1)];
    if (current && (index > 0 || !scrolled.current)) {
      scrolled.current = true;
      const el = current.startContainer.parentElement;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [version, index]);

  useEffect(() => () => { const reg = registry(); reg?.delete("search-hit"); reg?.delete("search-hit-current"); }, []);

  const clear = useCallback(() => { rangesRef.current = []; setCount(0); const reg = registry(); reg?.delete("search-hit"); reg?.delete("search-hit-current"); }, []);
  const step = useCallback((d: 1 | -1) => setIndex((i) => (count ? (i + d + count) % count : 0)), [count]);
  return { count, index, next: () => step(1), prev: () => step(-1), clear };
}
