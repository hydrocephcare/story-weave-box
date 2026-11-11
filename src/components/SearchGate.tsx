import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { OPEN_SEARCH_EVENT } from "@/lib/searchEvents";
import { useTrack } from "@/lib/courseTrack";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

const Palette = lazy(() => import("@/components/SearchPalette"));
const DentalSearch = lazy(() => import("@/components/dental/DentalSearch"));

/** Keeps the search window (and all the search code behind it) out of the first download: it loads the first time search is opened. */
export default function SearchGate() {
  const [loaded, setLoaded] = useState(false);
  const track = useTrack();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const requireAccount = useCallback(() => {
    if (loading) return false;
    if (user) return true;
    navigate("/login?redirect=%2Fsearch");
    return false;
  }, [loading, user?.id, navigate]);
  useEffect(() => {
    if (loaded) return;
    let pending: string | null = null;
    const onOpen = (e: Event) => { if (!requireAccount()) return; pending = String((e as CustomEvent).detail ?? ""); setLoaded(true); };
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (!requireAccount()) return; pending = ""; setLoaded(true); } };
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
      if (pending !== null) (window as unknown as { __ompathSearchPending?: string }).__ompathSearchPending = pending;
    };
  }, [loaded, requireAccount]);
  return loaded ? <Suspense fallback={null}>{track !== "medicine" ? <DentalSearch /> : <Palette />}</Suspense> : null;
}
