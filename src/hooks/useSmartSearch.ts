import { useEffect, useRef, useState } from "react";
import { findHits } from "@/lib/ompathAi";
import type { ParsedQuery } from "@/lib/ompathAiQuery";
import type { SiteHit } from "@/lib/siteSearch";

interface State { hits: SiteHit[]; related: string[]; parsed: ParsedQuery | null; loading: boolean; deepLoading: boolean; searched: boolean }
const EMPTY: State = { hits: [], related: [], parsed: null, loading: false, deepLoading: false, searched: false };

/**
 * The search page's engine. It understands a question the way Ompath AI does ("have tomorrow class", "psych notes yr 4",
 * a typo) and answers in two steps: titles, files and shipped notes first, so something appears almost at once,
 * then the text inside every note a moment later.
 */
export function useSmartSearch(query: string, opts: { year?: string; contentType?: string } = {}) {
  const [state, setState] = useState<State>(EMPTY);
  const request = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setState(EMPTY); return; }
    const id = ++request.current;
    setState((s) => ({ ...s, loading: true }));
    const timer = window.setTimeout(() => {
      void findHits(q, { ...opts, deep: false }).then((fast) => {
        if (id !== request.current) return;
        setState({ hits: fast.hits, related: fast.related, parsed: fast.parsed, loading: false, deepLoading: true, searched: true });
        return findHits(q, { ...opts, deep: true }).then((full) => {
          if (id !== request.current) return;
          setState({ hits: full.hits, related: full.related, parsed: full.parsed, loading: false, deepLoading: false, searched: true });
        });
      }).catch(() => { if (id === request.current) setState((s) => ({ ...s, loading: false, deepLoading: false, searched: true })); });
    }, 120);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, opts.year, opts.contentType]);

  return state;
}
