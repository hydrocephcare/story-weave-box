import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { OPEN_SEARCH_EVENT } from "@/lib/searchEvents";
import { PAPER_INDEX, paperPath } from "@/lib/dentalPapers";

/** Search for dental students: only the dental section is searched (the medical library is not offered). */
export default function DentalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => {
    const pending = (window as unknown as { __ompathSearchPending?: string }).__ompathSearchPending;
    if (pending !== undefined) { setQ(pending); setOpen(true); delete (window as unknown as { __ompathSearchPending?: string }).__ompathSearchPending; }
    const onOpen = (e: Event) => { setQ(String((e as CustomEvent).detail ?? "")); setOpen(true); };
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(true); } };
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener(OPEN_SEARCH_EVENT, onOpen); window.removeEventListener("keydown", onKey); };
  }, []);
  const needles = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = useMemo(() => (needles.length ? PAPER_INDEX.filter((p) => needles.every((w) => `${p.title} ${p.unitCode} ${p.unitTitle} ${p.date} ${p.programme} ${p.group}`.toLowerCase().includes(w))).slice(0, 30) : PAPER_INDEX.slice(0, 8)), [q]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[12%] max-w-xl translate-y-0 gap-0 p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">Search dental past papers</DialogTitle>
        <DialogDescription className="sr-only">Search the dental past papers by unit, code or year.</DialogDescription>
        <div className="flex items-center gap-3 border-b border-border px-4"><Search className="h-5 w-5 shrink-0 text-muted-foreground" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a unit, code or year…" aria-label="Search dental past papers" className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground" /></div>
        <ul className="max-h-[60dvh] overflow-y-auto py-1">
          {hits.length === 0 ? <li className="px-4 py-8 text-center text-sm text-muted-foreground">No dental paper matches that.</li> : hits.map((p) => (
            <li key={p.slug}><button type="button" onClick={() => { setOpen(false); navigate(paperPath(p.slug)); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-primary/10"><FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.unitTitle} · {p.sitting}</span><span className="block truncate text-xs text-muted-foreground">{p.unitCode} · {p.date}</span></span></button></li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
