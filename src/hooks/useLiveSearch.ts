import { useEffect, useRef, useState } from "react";
import { globalSearch, type SearchFilters, type SearchHit } from "@/lib/search";

const DEBOUNCE_MS = 200;
const MIN_CHARS = 2;

interface LiveSearchState {
  hits: SearchHit[];
  related: string[];
  loading: boolean;
  searched: boolean;
}

/**
 * Debounced, race-safe live search: fires globalSearch shortly after typing
 * stops, and drops the response for any query that's no longer current (a
 * fast typer can otherwise have an older, slower request resolve after a
 * newer one and flash stale results).
 */
export function useLiveSearch(query: string, filters: SearchFilters, enabled = true) {
  const [state, setState] = useState<LiveSearchState>({ hits: [], related: [], loading: false, searched: false });
  const requestId = useRef(0);
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    const trimmed = query.trim();
    if (!enabled || trimmed.length < MIN_CHARS) {
      setState({ hits: [], related: [], loading: false, searched: false });
      return;
    }

    setState((s) => ({ ...s, loading: true }));
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      void globalSearch(trimmed, filters).then((result) => {
        if (id !== requestId.current) return;
        setState({ hits: result.hits, related: result.related, loading: false, searched: true });
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filtersKey, enabled]);

  return state;
}
