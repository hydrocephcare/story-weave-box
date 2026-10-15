import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import AdminAgent from "@/components/AdminAgent";
import { installProblemWatch, recentProblems } from "@/lib/adminProblems";

/** A floating assistant on every admin page: knows which page you are on and what just went wrong, opens pages for you, and asks before it changes anything. */
export default function AdminCopilot() {
  const [open, setOpen] = useState(false);
  const [problems, setProblems] = useState(0);
  useEffect(() => {
    installProblemWatch();
    const t = window.setInterval(() => setProblems(recentProblems().length), 2000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} aria-label="Open the admin assistant" className="fixed bottom-24 right-4 z-50 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lg ring-1 ring-black/10 hover:brightness-110 sm:bottom-6">
          <Sparkles className="h-4 w-4" /> Assistant
          {problems > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[11px] leading-5 text-white" title="Something went wrong a moment ago. Ask me to explain it.">{problems}</span>}
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top)] sm:inset-auto sm:bottom-4 sm:right-4 sm:h-[min(40rem,calc(100dvh-2rem))] sm:w-[28rem] sm:rounded-2xl sm:border sm:border-border sm:pt-0 sm:shadow-2xl" role="dialog" aria-label="Admin assistant">
          <button type="button" onClick={() => setOpen(false)} aria-label="Close the assistant" className="absolute right-2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-10 flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted sm:top-2"><X className="h-5 w-5" /></button>
          <AdminAgent compact />
        </div>
      )}
    </>
  );
}
