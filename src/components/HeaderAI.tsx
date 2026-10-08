import { Sparkles } from "lucide-react";
import { openAI } from "@/lib/aiEvents";

interface HeaderAIProps { variant?: "desktop" | "mobile"; onNavigate?: () => void }

/** Navbar button for Ompath AI (also Ctrl/⌘ + J on any page). It takes the place of the old search icon: the AI panel searches too. */
export default function HeaderAI({ variant = "desktop", onNavigate }: HeaderAIProps) {
  const open = () => { onNavigate?.(); openAI(); };
  if (variant === "desktop") {
    return (
      <button type="button" onClick={open} aria-label="Open Ompath AI (Ctrl J)" title="Ompath AI (Ctrl J)" className="flex h-9 items-center gap-1.5 rounded-lg bg-white/15 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/25">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Ompath AI</span>
      </button>
    );
  }
  return (
    <button type="button" onClick={open} aria-label="Open Ompath AI" className="flex w-full items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2.5 text-left text-sm font-semibold text-white">
      <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
      Ask Ompath AI — notes, papers, files…
    </button>
  );
}
