import { Suspense, lazy, useEffect, useState } from "react";
import { OPEN_SEARCH_EVENT } from "@/lib/searchEvents";

const Palette = lazy(() => import("@/components/SearchPalette"));

/** Keeps the search window (and all the search code behind it) out of the first download: it loads the first time search is opened. */
export default function SearchGate() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (loaded) return;
    let pending: string | null = null;
    const onOpen = (e: Event) => { pending = String((e as CustomEvent).detail ?? ""); setLoaded(true); };
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); pending = ""; setLoaded(true); } };
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
      if (pending !== null) (window as unknown as { __ompathSearchPending?: string }).__ompathSearchPending = pending;
    };
  }, [loaded]);
  return loaded ? <Suspense fallback={null}><Palette /></Suspense> : null;
}
