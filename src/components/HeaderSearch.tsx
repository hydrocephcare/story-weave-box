import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { useLiveSearch } from "@/hooks/useLiveSearch";
import { logSearch } from "@/lib/search";

const EMPTY_FILTERS = {};

interface HeaderSearchProps {
  variant?: "desktop" | "mobile";
  onNavigate?: () => void;
}

/** Compact live-search box for the navbar: quick top hits in a dropdown as you type. */
export default function HeaderSearch({ variant = "desktop", onNavigate }: HeaderSearchProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const { hits, loading, searched } = useLiveSearch(q, EMPTY_FILTERS, open);
  const top = hits.slice(0, 6);

  useEffect(() => {
    if (variant !== "desktop") return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [variant]);

  const goToFullResults = () => {
    if (!q.trim()) return;
    navigate(`/search?q=${encodeURIComponent(q.trim())}`);
    setOpen(false);
    onNavigate?.();
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    goToFullResults();
  };

  const goToHit = (href: string, id: string, kind: string) => {
    void logSearch(q, hits.length, { type: kind, id });
    navigate(href);
    setOpen(false);
    setQ("");
    onNavigate?.();
  };

  const inputBox = (
    <form onSubmit={onSubmit} className={variant === "desktop" ? "relative" : "relative w-full"}>
      <div
        className={
          variant === "desktop"
            ? `flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 transition-all ${open ? "w-56" : "w-9"}`
            : "flex items-center gap-2 rounded-lg border border-border bg-card px-3"
        }
      >
        <Search className={variant === "desktop" ? "h-4 w-4 shrink-0 text-white/80" : "h-4 w-4 shrink-0 text-muted-foreground"} aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search notes, units, MCQs…"
          aria-label="Search the study library"
          className={
            variant === "desktop"
              ? `min-w-0 flex-1 bg-transparent py-1.5 text-sm text-white outline-none placeholder:text-white/50 transition-opacity ${open ? "opacity-100" : "w-0 opacity-0"}`
              : "min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"
          }
        />
        {q && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQ("")}
            className={variant === "desktop" ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground"}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-y-auto rounded-xl border border-border bg-card text-left shadow-lg sm:w-80">
          {loading && top.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Searching…</div>
          ) : searched && top.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No quick matches for "{q}".</div>
          ) : (
            <ul>
              {top.map((h) => (
                <li key={`${h.kind}-${h.id}`}>
                  <button
                    type="button"
                    onClick={() => goToHit(h.href, h.id, h.kind)}
                    className="flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left text-sm hover:bg-primary/5"
                  >
                    <span className="line-clamp-1 font-medium text-foreground">{h.title}</span>
                    <span className="text-xs text-muted-foreground">{h.category || h.kind}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={goToFullResults}
            className="block w-full border-t border-border px-4 py-2.5 text-left text-xs font-semibold text-primary hover:bg-primary/5"
          >
            See all results for "{q}" →
          </button>
        </div>
      )}
    </form>
  );

  if (variant === "desktop") {
    return <div ref={rootRef}>{inputBox}</div>;
  }
  return inputBox;
}
