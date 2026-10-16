import OmpathMark from "@/components/ai/OmpathMark";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { X } from "lucide-react";
import AdminAgent from "@/components/AdminAgent";
import { supabase } from "@/integrations/supabase/client";
import { runAction } from "@/lib/adminAgent";
import { installProblemWatch, recentProblems } from "@/lib/adminProblems";

/** A floating assistant on every admin page: knows which page you are on and what just went wrong, opens pages for you, and asks before it changes anything. */
export default function AdminCopilot() {
  const { isAdmin } = useAuth();
  const { pathname } = useLocation();
  const here = isAdmin && pathname.startsWith("/admin");
  const [open, setOpenRaw] = useState(false);
  const [started, setStarted] = useState(false); // the assistant loads on first open, then stays alive (even closed) so a running task finishes while you move around
  const setOpen = (v: boolean) => { if (v) setStarted(true); setOpenRaw(v); };
  const [problems, setProblems] = useState(0);
  useEffect(() => {
    if (!here) return; // visitors never get the error watcher or any admin job
    installProblemWatch();
    const t = window.setInterval(() => setProblems(new Set(recentProblems().map((p) => p.what)).size), 2000);
    return () => window.clearInterval(t);
  }, [here]);
  // "SEO fixes by itself": when that Autopilot job is on Auto, rewrite up to 10 weak search descriptions at most once every 6 hours while an admin page is open.
  // Each run is logged in Autopilot with an Undo. (Without a server-side scheduler this is the safest way to run an AI job: it only runs while you are signed in.)
  useEffect(() => {
    if (!here) return;
    const KEY = "ompath_seo_autofix_at";
    const timer = window.setTimeout(async () => {
      try {
        const last = Number(localStorage.getItem(KEY) || 0);
        if (Date.now() - last < 6 * 3600_000) return;
        const { data } = await (supabase as any).from("agent_capabilities").select("mode").eq("key", "seo_autofix").maybeSingle();
        if (data?.mode !== "auto") return;
        localStorage.setItem(KEY, String(Date.now()));
        await runAction({ tool: "seo_fix", args: { limit: 10 } }, {} as never);
      } catch { /* silent: it will try again next time */ }
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [here]);
  if (!here) return null;
  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} aria-label="Open the admin assistant" className="fixed bottom-24 right-4 z-50 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-base font-bold text-primary-foreground shadow-xl ring-1 ring-black/10 hover:brightness-110 sm:bottom-6">
          <OmpathMark className="h-7 w-7" /> Assistant
          {problems > 0 && <span className="rounded-full bg-red-500 px-2 text-xs font-black leading-5 text-white" title="Something went wrong a moment ago. Open me to see what and fix it.">{problems}</span>}
        </button>
      )}
      {(
        <div className={`${open ? "flex" : "hidden"} fixed inset-0 z-50 h-dvh flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top)] sm:inset-auto sm:bottom-4 sm:right-4 sm:h-[min(44rem,calc(100dvh-2rem))] sm:w-[34rem] sm:rounded-3xl sm:border sm:border-border sm:pt-0 sm:shadow-2xl`} role="dialog" aria-label="Admin assistant">
          <button type="button" onClick={() => setOpen(false)} aria-label="Close the assistant" className="absolute right-2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-10 flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted sm:top-2"><X className="h-5 w-5" /></button>
          {started && <AdminAgent compact />}
        </div>
      )}
    </>
  );
}
