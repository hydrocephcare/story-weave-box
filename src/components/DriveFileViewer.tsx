import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Download, ExternalLink, Flag, Loader2, Maximize, Maximize2, Minimize, Minimize2, Moon, Network, RefreshCw, StickyNote, Sun, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import registry from "@/data/libraries.json";
import { prettyTitle } from "@/lib/libraryMeta";
import ConnectedLearning from "@/components/ConnectedLearning";
import { closeTab, openTab, useReaderTabs } from "@/lib/readerTabs";
import { toggleBookRead, useBookShelf } from "@/lib/bookShelf";
import { logStudy } from "@/lib/studyLog";
import { bookSizeMB, formatMB } from "@/lib/bookSizes";

export type DriveKind = "pdf" | "ppt" | "doc" | "video" | "img" | "zip" | "file";
export type DriveFile = [id: string, name: string, kind: DriveKind];

// drive.usercontent.google.com serves the file itself; confirm=t skips the
// "can't scan for viruses" interstitial that large files (videos) otherwise hit.
export const downloadUrl = (id: string) => `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
// /preview is built to be embedded: PDFs, slides, documents and videos render inside the page.
export const previewUrl = (id: string) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
export const thumbUrl = (id: string, width = 400) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${width}`;
export const canPreview = (kind: DriveKind) => kind !== "zip" && kind !== "file";
export const cleanName = (name: string) => prettyTitle(name);

/** One tap to tell the site owner a file is dead (opens WhatsApp with the file name filled in). */
export const reportUrl = (file: DriveFile, where?: string) =>
  `https://wa.me/${registry.contactWhatsApp}?text=${encodeURIComponent(`Hi, this file is not opening on Ompath Study:\n"${cleanName(file[1])}"${where ? `\n${where}` : ""}\n${typeof window !== "undefined" ? window.location.href : ""}`)}`;

interface Props {
  items: DriveFile[];
  index: number | null;
  onIndexChange: (next: number | null) => void;
  onDownload: (file: DriveFile) => void;
  /** File ids known to be removed from Drive (public/data/broken-links.json). */
  broken?: Set<string>;
  /** Shown in the report message, e.g. "Year 1 > Anatomy". */
  where?: string;
}

const NIGHT_KEY = "ompath_reader_night";
const NOTE_KEY = (id: string) => `ompath_reader_note_${id}`;
const safeGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

function Tool({ label, onClick, pressed, disabled, children }: { label: string; onClick: () => void; pressed?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} aria-pressed={pressed} className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-40 ${pressed ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:border-primary/50"}`}>
      {children}
    </button>
  );
}

/**
 * The reader: a full-screen workspace with browser-style tabs, true fullscreen, a distraction-free mode,
 * night reading, a reading timer that feeds the study streak, and notes for each file.
 */
export default function DriveFileViewer({ items, index, onIndexChange, onDownload, broken, where }: Props) {
  const open = index !== null && index >= 0 && index < items.length;
  const listFile = open ? items[index as number] : null;
  const tabs = useReaderTabs();
  const { read } = useBookShelf();
  const [activeId, setActiveId] = useState<string | null>(null);
  const flipFrom = useRef<string | null>(null);
  const file: DriveFile | null = (activeId && tabs.find((t) => t[0] === activeId)) || listFile;
  const pos = file ? items.findIndex((x) => x[0] === file[0]) : -1;

  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [slow, setSlow] = useState(false);
  const [failed, setFailed] = useState(false);
  const [panel, setPanel] = useState<"none" | "related" | "notes">("none");
  const [immersive, setImmersive] = useState(false);
  const [night, setNight] = useState(() => safeGet(NIGHT_KEY) === "1");
  const [fullscreen, setFullscreen] = useState(false);
  const [readSecs, setReadSecs] = useState(0);
  const [note, setNote] = useState("");
  const isBroken = Boolean(file && (failed || broken?.has(file[0])));
  const canFullscreen = typeof document !== "undefined" && Boolean(document.fullscreenEnabled);

  // A file picked from a list becomes the active tab; flipping with next/previous takes over the tab you were on.
  const listId = listFile?.[0] ?? null;
  useEffect(() => {
    if (!open || !listFile) return;
    openTab(listFile, flipFrom.current);
    flipFrom.current = null;
    setActiveId(listFile[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, listId]);

  useEffect(() => { setLoaded(false); setFailed(false); setSlow(false); }, [file?.[0], reloadKey]);
  // A big book can take a while to open on Drive; say so after a few seconds instead of leaving a blank page.
  useEffect(() => {
    if (!open || loaded) return;
    const t = window.setTimeout(() => setSlow(true), 7000);
    return () => window.clearTimeout(t);
  }, [open, loaded, file?.[0], reloadKey]);
  useEffect(() => { if (!open) { setPanel("none"); setImmersive(false); } }, [open]);

  // Notes for the file you are reading, saved as you type.
  useEffect(() => { setNote(file ? safeGet(NOTE_KEY(file[0])) ?? "" : ""); }, [file?.[0]]);
  const saveNote = (v: string) => { setNote(v); if (file) safeSet(NOTE_KEY(file[0]), v); };

  // Reading time: counted while the reader is open and visible, and added to today's study log in chunks.
  useEffect(() => {
    if (!open) return;
    setReadSecs(0);
    let pending = 0;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      pending += 5; setReadSecs((s) => s + 5);
      if (pending >= 300) { logStudy(5); pending -= 300; }
    }, 5000);
    return () => { clearInterval(t); const m = Math.floor(pending / 60); if (m > 0) logStudy(m); };
  }, [open]);

  // Keep the screen awake while you read.
  useEffect(() => {
    if (!open) return;
    type Lock = { release: () => Promise<void> };
    let lock: Lock | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Lock> } };
    const request = async () => { try { lock = (await nav.wakeLock?.request("screen")) ?? null; } catch { /* not allowed or unsupported */ } };
    request();
    const onVisible = () => { if (document.visibilityState === "visible") request(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); lock?.release().catch(() => { /* already released */ }); };
  }, [open]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  useEffect(() => { if (!open && document.fullscreenElement) document.exitFullscreen().catch(() => { /* not in fullscreen */ }); }, [open]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { /* ignore */ });
    else document.documentElement.requestFullscreen().catch(() => { /* blocked */ });
  };
  const toggleNight = () => setNight((n) => { safeSet(NIGHT_KEY, n ? "0" : "1"); return !n; });

  const flip = (delta: number) => {
    const target = items[pos + delta];
    if (!file || !target) return;
    flipFrom.current = file[0];
    onIndexChange(pos + delta);
  };
  const switchTab = (t: DriveFile) => {
    setActiveId(t[0]);
    const at = items.findIndex((x) => x[0] === t[0]);
    if (at >= 0) onIndexChange(at);
  };
  const closeOne = (id: string) => {
    const rest = tabs.filter((t) => t[0] !== id);
    closeTab(id);
    if (file?.[0] !== id) return;
    if (rest.length === 0) { onIndexChange(null); return; }
    switchTab(rest[Math.min(tabs.findIndex((t) => t[0] === id), rest.length - 1)]);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") flip(-1);
      else if (e.key === "ArrowRight") flip(1);
      else if (e.key === "n" || e.key === "N") toggleNight();
      else if (e.key === "f" || e.key === "F") { if (canFullscreen) toggleFullscreen(); }
      else if (e.key === "i" || e.key === "I") setImmersive((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos, items, file]);

  // Warm the next/previous images so flipping through an atlas feels instant.
  useEffect(() => {
    if (!open || !file || file[2] !== "img") return;
    for (const d of [-1, 1]) {
      const n = items[pos + d];
      if (n && n[2] === "img") { const img = new Image(); img.referrerPolicy = "no-referrer"; img.src = thumbUrl(n[0], 1600); }
    }
  }, [open, pos, file, items]);

  const minutes = Math.floor(readSecs / 60);
  const finished = file ? read.has(file[0]) : false;
  const nightFilter = night ? { filter: "invert(1) hue-rotate(180deg)" } : undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onIndexChange(null); }}>
      <DialogContent className="fixed inset-0 left-0 top-0 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:rounded-none">
        {file && (
          <>
            {immersive ? (
              <>
                <DialogTitle className="sr-only">{cleanName(file[1])}</DialogTitle>
                <DialogDescription className="sr-only">Distraction-free reading mode</DialogDescription>
                <button type="button" onClick={() => setImmersive(false)} aria-label="Show the toolbar" className="absolute bottom-4 left-4 z-30 inline-flex h-10 items-center gap-1.5 rounded-full bg-foreground/85 px-4 text-xs font-bold text-background shadow-lg backdrop-blur"><Minimize2 className="h-4 w-4" /> Toolbar</button>
              </>
            ) : (
              <>
                {tabs.length > 1 && (
                  <div role="tablist" aria-label="Open files" className="no-scrollbar mr-11 flex items-end gap-1 overflow-x-auto border-b border-border bg-muted/50 px-2 pt-1.5">
                    {tabs.map((t) => {
                      const on = t[0] === file[0];
                      return (
                        <div key={t[0]} role="presentation" className={`flex max-w-[12rem] shrink-0 items-center gap-1 rounded-t-lg border border-b-0 py-1 pl-2.5 pr-1 text-xs font-semibold ${on ? "border-border bg-background text-foreground" : "border-transparent text-muted-foreground hover:bg-background/60"}`}>
                          <button type="button" role="tab" aria-selected={on} onClick={() => switchTab(t)} className="min-w-0 truncate py-0.5 text-left">{cleanName(t[1])}</button>
                          <button type="button" onClick={() => closeOne(t[0])} aria-label={`Close ${cleanName(t[1])}`} className="rounded p-0.5 hover:bg-muted"><X className="h-3 w-3" /></button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border px-3 py-2 pr-12 sm:flex-nowrap">
                  <button type="button" onClick={() => onIndexChange(null)} aria-label="Close reader" className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-2 text-xs font-bold"><ChevronLeft className="h-4 w-4" /> Back</button>
                  <div className="min-w-[55%] flex-1 sm:min-w-0">
                    <DialogTitle className="line-clamp-2 text-sm font-bold leading-snug">{cleanName(file[1])}</DialogTitle>
                    <DialogDescription className="text-[11px]">
                      {pos >= 0 ? `${pos + 1} of ${items.length}` : "Open tab"}{where ? ` · ${where}` : ""}{bookSizeMB(file[0]) !== undefined ? ` · ${formatMB(bookSizeMB(file[0]) as number)}` : ""}{minutes > 0 ? ` · ${minutes} min reading` : ""}
                    </DialogDescription>
                  </div>
                  <div className="no-scrollbar flex w-full items-center justify-start gap-1.5 overflow-x-auto sm:w-auto sm:justify-end">
                    <Tool label="Previous file" onClick={() => flip(-1)} disabled={pos <= 0}><ChevronLeft className="h-4 w-4" /></Tool>
                    <Tool label="Next file" onClick={() => flip(1)} disabled={pos < 0 || pos >= items.length - 1}><ChevronRight className="h-4 w-4" /></Tool>
                    <Tool label={night ? "Day reading" : "Night reading"} onClick={toggleNight} pressed={night}>{night ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Tool>
                    <Tool label="Distraction-free reading" onClick={() => setImmersive(true)}><Maximize2 className="h-4 w-4" /></Tool>
                    {canFullscreen && <Tool label={fullscreen ? "Leave full screen" : "Full screen"} onClick={toggleFullscreen} pressed={fullscreen}>{fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}</Tool>}
                    <Tool label="My notes on this file" onClick={() => setPanel((p) => (p === "notes" ? "none" : "notes"))} pressed={panel === "notes"}><StickyNote className="h-4 w-4" /></Tool>
                    <Tool label={finished ? "Marked as finished" : "Mark as finished"} onClick={() => toggleBookRead(file[0])} pressed={finished}><Check className="h-4 w-4" /></Tool>
                    <Tool label="Connected notes and files" onClick={() => setPanel((p) => (p === "related" ? "none" : "related"))} pressed={panel === "related"}><Network className="h-4 w-4" /></Tool>
                    {!isBroken && (
                      <button type="button" onClick={() => onDownload(file)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90"><Download className="h-3.5 w-3.5" /> <span className="hidden min-[420px]:inline">Download</span></button>
                    )}
                  </div>
                </div>
              </>
            )}

            <div className={`relative min-h-0 flex-1 ${night ? "bg-neutral-900" : "bg-muted/30"}`}>
              {panel === "related" && (
                <div className="absolute inset-y-0 right-0 z-20 w-full overflow-y-auto border-l border-border bg-card p-3 shadow-xl sm:w-96">
                  <ConnectedLearning key={file[0]} target={{ id: `file:${file[0]}`, title: cleanName(file[1]), where: where ?? "", year: Number((where ?? "").match(/[1-6]/)?.[0]) || null }} onNavigate={() => onIndexChange(null)} />
                </div>
              )}
              {panel === "notes" && (
                <div className="absolute inset-y-0 right-0 z-20 flex w-full flex-col gap-2 border-l border-border bg-card p-3 shadow-xl sm:w-96">
                  <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-foreground">My notes</h3><button type="button" onClick={() => setPanel("none")} aria-label="Close notes" className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button></div>
                  <p className="text-[11px] text-muted-foreground">Page numbers, things to revisit, questions for your lecturer. Saved on this device as you type.</p>
                  <textarea value={note} onChange={(e) => saveNote(e.target.value)} placeholder="e.g. p.214 — thyroid surgery steps" className="min-h-0 flex-1 resize-none rounded-lg border border-border bg-background p-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
                </div>
              )}
              {isBroken ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <AlertTriangle className="h-9 w-9 text-amber-500" />
                  <p className="max-w-md text-sm font-semibold text-foreground">This file isn’t available right now.</p>
                  <p className="max-w-md text-xs leading-relaxed text-muted-foreground">It may have been moved, removed, or Google Drive is having trouble. Try the next file, or let us know and we will fix it.</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <a href={reportUrl(file, where)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"><Flag className="h-3.5 w-3.5" /> Report this file</a>
                    {pos >= 0 && pos < items.length - 1 && <button type="button" onClick={() => flip(1)} className="rounded-md border border-border px-4 py-2 text-xs font-bold">Next file</button>}
                  </div>
                </div>
              ) : (
                <>
                  {!loaded && canPreview(file[2]) && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-muted/60 text-xs font-semibold text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" /> Opening file…
                      {bookSizeMB(file[0]) !== undefined && <span className="font-normal">{formatMB(bookSizeMB(file[0]) as number)}{(bookSizeMB(file[0]) as number) >= 20 ? ", a big book, so it can take a minute" : ""}</span>}
                      {slow && <span className="pointer-events-auto mt-1 max-w-xs px-4 font-normal">Still loading. You can wait, or <a href={`https://drive.google.com/file/d/${encodeURIComponent(file[0])}/view`} target="_blank" rel="noopener noreferrer" className="font-bold text-primary underline">open it in Drive</a>.</span>}
                    </div>
                  )}
                  {file[2] === "img" ? (
                    <div className="flex h-full items-center justify-center overflow-auto p-2">
                      <img
                        key={file[0]}
                        src={thumbUrl(file[0], 1600)}
                        referrerPolicy="no-referrer"
                        alt={cleanName(file[1])}
                        onLoad={() => setLoaded(true)}
                        onError={() => setFailed(true)}
                        style={nightFilter}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  ) : canPreview(file[2]) ? (
                    <iframe
                      key={`${file[0]}-${reloadKey}`}
                      src={previewUrl(file[0])}
                      title={cleanName(file[1])}
                      className="h-full w-full border-0"
                      style={nightFilter}
                      referrerPolicy="no-referrer"
                      allow="autoplay; fullscreen"
                      allowFullScreen
                      onLoad={() => setLoaded(true)}
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
                      This file type cannot be previewed.
                      <button type="button" onClick={() => onDownload(file)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">
                        <Download className="h-3.5 w-3.5" /> Download it
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {!immersive && !isBroken && canPreview(file[2]) && (
              <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-border px-4 py-1.5 text-[11px] text-muted-foreground">
                Blank or very slow?
                <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="inline-flex items-center gap-1 font-bold text-primary hover:underline"><RefreshCw className="h-3 w-3" /> Reload</button>
                <a href={`https://drive.google.com/file/d/${encodeURIComponent(file[0])}/view`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-primary hover:underline"><ExternalLink className="h-3 w-3" /> Open in Drive</a>
                <a href={reportUrl(file, where)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-primary hover:underline"><Flag className="h-3 w-3" /> Report this file</a>
                <span className="hidden sm:inline">Keys: ← → files · N night · I focus · F full screen</span>
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
