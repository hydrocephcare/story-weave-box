import { useEffect, useRef, useState } from "react";
import { siteSearch, type SiteHit, type SiteSearchOptions } from "@/lib/siteSearch";

interface State { hits: SiteHit[]; related: string[]; loading: boolean; searched: boolean }
const EMPTY: State = { hits: [], related: [], loading: false, searched: false };

/** Debounced, race-safe search across notes, library files, outline topics and pages. */
export function useSiteSearch(query: string, opts: SiteSearchOptions = {}, enabled = true) {
  const [state, setState] = useState<State>(EMPTY);
  const request = useRef(0);
  const key = JSON.stringify(opts);

  useEffect(() => {
    const id = ++request.current;
    const q = query.trim();
    if (!enabled || q.length < 2) {
      setState(EMPTY);
      return () => { if (request.current === id) request.current++; };
    }
    setState((s) => ({ ...s, loading: true }));
    const timer = setTimeout(() => {
      void siteSearch(q, opts)
        .then((r) => {
          if (id === request.current) setState({ hits: r.hits, related: r.related, loading: false, searched: true });
        })
        .catch(() => {
          if (id === request.current) setState((s) => ({ ...s, loading: false, searched: true }));
        });
    }, 280);
    return () => {
      clearTimeout(timer);
      if (request.current === id) request.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, key, enabled]);

  return state;
}
