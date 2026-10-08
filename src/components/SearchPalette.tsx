import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, CalendarDays, ClipboardList, CornerDownLeft, File, FileText, FolderOpen, GraduationCap, Layers, Loader2, Newspaper, Presentation, Search, Film, Image as ImageIcon, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useSiteSearch } from "@/hooks/useSiteSearch";
import { groupSiteHits, type SiteHit } from "@/lib/siteSearch";
import { logSearch } from "@/lib/search";
import Highlight from "@/components/Highlight";
import { HitIcon } from "@/components/HitIcon";
import { OPEN_SEARCH_EVENT } from "@/lib/searchEvents";


const RECENT_KEY = "ompath_recent_searches";
const readRecent = (): string[] => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); return Array.isArray(v) ? v.slice(0, 6) : []; } catch { return []; } };
const SUGGESTED = [
  { label: "Today's timetable", href: "/dashboard", icon: CalendarDays },
  { label: "Smart revision", href: "/revise", icon: GraduationCap },
  { label: "Course outlines", href: "/course-outlines", icon: ClipboardList },
  { label: "Year 1 library", href: "/library/year-1", icon: FolderOpen },
];

/** Ctrl/⌘ + K anywhere: live search over notes, library files, outline topics and pages. */
export default function SearchPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const { hits, loading, searched } = useSiteSearch(q, {}, open);

  const shown = useMemo(() => hits.slice(0, 24), [hits]);
  const groups = useMemo(() => groupSiteHits(shown), [shown]);
  const flat = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setRecent(readRecent()); setOpen((o) => !o); }
    };
    const onOpen = (e: Event) => { setRecent(readRecent()); setQ(String((e as CustomEvent).detail ?? "")); setOpen(true); };
    const w = window as unknown as { __ompathSearchPending?: string };
    if (w.__ompathSearchPending !== undefined) { setRecent(readRecent()); setQ(w.__ompathSearchPending); setOpen(true); delete w.__ompathSearchPending; }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(OPEN_SEARCH_EVENT, onOpen); };
  }, []);

  useEffect(() => { setActive(0); }, [q, hits]);
  useEffect(() => { listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  const go = useCallback((hit: SiteHit) => {
    const term = q.trim();
    if (term) {
      try { localStorage.setItem(RECENT_KEY, JSON.stringify([term, ...readRecent().filter((r) => r !== term)].slice(0, 6))); } catch { /* storage blocked */ }
      void logSearch(term, hits.length, { type: hit.kind, id: hit.key });
    }
    setOpen(false); setQ("");
    navigate(hit.href);
  }, [q, hits.length, navigate]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (flat[active]) go(flat[active]);
      else if (q.trim().length >= 2) { setOpen(false); navigate(`/search?q=${encodeURIComponent(q.trim())}`); }
    }
  };

  let idx = -1;
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <DialogContent className="top-[12%] flex max-h-[78dvh] w-[94vw] max-w-2xl translate-y-0 flex-col gap-0 overflow-hidden p-0 [&>button]:hidden">
        <DialogTitle className="sr-only">Search the site</DialogTitle>
        <DialogDescription className="sr-only">Search notes, library files, course outline topics and pages. Use the arrow keys and Enter.</DialogDescription>
        <div className="flex items-center gap-3 border-b border-border px-4">
          {loading ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" /> : <Search className="h-5 w-5 shrink-0 text-muted-foreground" />}
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search notes, files, outlines, pages…"
            aria-label="Search the site"
            className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <button type="button" onClick={() => setOpen(false)} aria-label="Close search" className="rounded-md border border-border px-2 py-1 text-[10px] font-bold text-muted-foreground hover:text-foreground sm:hidden"><X className="h-3.5 w-3.5" /></button>
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:block">Esc</kbd>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2">
          {q.trim().length < 2 ? (
            <div className="space-y-4 px-4 py-3">
              {recent.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Recent searches</p>
                  <div className="flex flex-wrap gap-1.5">{recent.map((r) => <button key={r} type="button" onClick={() => setQ(r)} className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:border-primary/50 hover:text-primary">{r}</button>)}</div>
                </div>
              )}
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Jump to</p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {SUGGESTED.map((s) => <button key={s.href} type="button" onClick={() => { setOpen(false); navigate(s.href); }} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm font-semibold hover:border-primary/50 hover:bg-primary/5"><s.icon className="h-4 w-4 text-primary" /> {s.label}</button>)}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Type at least two letters — try “pharmacology”, “MBMM 3333” or “anaemia”.</p>
            </div>
          ) : searched && flat.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-semibold text-foreground">Nothing found for “{q}”</p>
              <p className="mt-1 text-xs text-muted-foreground">Check the spelling, or try a broader word.</p>
              <button type="button" onClick={() => { setOpen(false); navigate(`/search?q=${encodeURIComponent(q.trim())}`); }} className="mt-3 text-xs font-bold text-primary hover:underline">Search inside every note →</button>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.group} className="mb-1">
                <p className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{g.group}</p>
                {g.rows.map((h) => {
                  idx += 1;
                  const i = idx;
                  return (
                    <button
                      key={h.key}
                      type="button"
                      data-idx={i}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(h)}
                      className={`group flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${i === active ? "bg-primary/10" : ""}`}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10"><HitIcon hit={h} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground"><Highlight text={h.title} query={q} /></span>
                        <span className="block truncate text-[11px] text-muted-foreground">{h.subtitle}</span>
                      </span>
                      <ArrowRight className={`h-4 w-4 shrink-0 text-primary transition-transform ${i === active ? "translate-x-0.5" : "opacity-40"}`} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-3"><span><kbd className="font-bold">↑↓</kbd> move</span><span className="flex items-center gap-1"><CornerDownLeft className="h-3 w-3" /> open</span></span>
          {q.trim().length >= 2 && <button type="button" onClick={() => { setOpen(false); navigate(`/search?q=${encodeURIComponent(q.trim())}`); }} className="font-bold text-primary hover:underline">All results &amp; inside notes →</button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
