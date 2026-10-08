import { Suspense, lazy, useEffect, useState } from "react";
import { AI_RESUME_KEY, OPEN_AI_EVENT } from "@/lib/aiEvents";

const Host = lazy(() => import("@/components/ai/OmpathAIHost"));

/**
 * Keeps the AI panel out of the first download. It waits for the first request to open Ompath AI (button, Ctrl+J, /ai link),
 * loads the panel, which then picks up the request so nothing is lost. If you left for a note from the panel, it loads straight away
 * so the "Back to Ompath AI" button can show.
 */
export default function AIGate() {
  const [loaded, setLoaded] = useState(() => { try { return sessionStorage.getItem(AI_RESUME_KEY) === "1"; } catch { return false; } });
  useEffect(() => {
    if (loaded) return;
    let pending: string | null = null;
    const onOpen = (e: Event) => { pending = String((e as CustomEvent).detail ?? ""); setLoaded(true); };
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") { e.preventDefault(); pending = ""; setLoaded(true); } };
    window.addEventListener(OPEN_AI_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_AI_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
      // the panel mounts next; hand it the request that woke us
      if (pending !== null) (window as unknown as { __ompathAiPending?: string }).__ompathAiPending = pending;
    };
  }, [loaded]);
  return loaded ? <Suspense fallback={null}><Host /></Suspense> : null;
}
