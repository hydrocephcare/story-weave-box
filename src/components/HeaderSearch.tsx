import { Search } from "lucide-react";
import { openSearch } from "@/lib/searchEvents";

interface HeaderSearchProps {
  variant?: "desktop" | "mobile";
  onNavigate?: () => void;
}

/** Navbar search: opens the site-wide live search (also Ctrl/⌘ + K on any page). */
export default function HeaderSearch({ variant = "desktop", onNavigate }: HeaderSearchProps) {
  const open = () => { onNavigate?.(); openSearch(); };

  if (variant === "desktop") {
    return (
      <button type="button" onClick={open} aria-label="Search notes, files and outlines (Ctrl K)" title="Search (Ctrl K)" className="flex h-9 items-center gap-2 rounded-lg bg-white/10 px-2.5 text-white/85 transition-colors hover:bg-white/20">
        <Search className="h-4 w-4" aria-hidden="true" />
        <kbd className="hidden rounded border border-white/25 px-1 text-[9px] font-semibold text-white/60 xl:block">Ctrl K</kbd>
      </button>
    );
  }
  return (
    <button type="button" onClick={open} aria-label="Search the site" className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm text-muted-foreground">
      <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
      Search notes, files, outlines…
    </button>
  );
}
