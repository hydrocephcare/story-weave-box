import { useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Flag, Loader2, Network } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import registry from "@/data/libraries.json";
import { prettyTitle } from "@/lib/libraryMeta";
import ConnectedLearning from "@/components/ConnectedLearning";

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

/** Full-screen in-page viewer with previous/next, used by the library and the outlines page. */
export default function DriveFileViewer({ items, index, onIndexChange, onDownload, broken, where }: Props) {
  const open = index !== null && index >= 0 && index < items.length;
  const file = open ? items[index as number] : null;
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showRel, setShowRel] = useState(false);
  const isBroken = Boolean(file && (failed || broken?.has(file[0])));

  useEffect(() => { setLoaded(false); setFailed(false); }, [file?.[0]]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && (index as number) > 0) onIndexChange((index as number) - 1);
      if (e.key === "ArrowRight" && (index as number) < items.length - 1) onIndexChange((index as number) + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, items.length, onIndexChange]);

  // Warm the next/previous images so flipping through an atlas feels instant.
  useEffect(() => {
    if (!open || !file || file[2] !== "img") return;
    for (const d of [-1, 1]) {
      const n = items[(index as number) + d];
      if (n && n[2] === "img") { const img = new Image(); img.referrerPolicy = "no-referrer"; img.src = thumbUrl(n[0], 1600); }
    }
  }, [open, index, file, items]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onIndexChange(null); }}>
      <DialogContent className="fixed inset-0 left-0 top-0 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:rounded-none">
        {file && (
          <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border px-3 py-2 pr-12 sm:flex-nowrap">
              <button type="button" onClick={() => onIndexChange(null)} aria-label="Close reader" className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-2 text-xs font-bold"><ChevronLeft className="h-4 w-4" /> Back</button>
              <div className="min-w-[55%] flex-1 sm:min-w-0">
                <DialogTitle className="line-clamp-2 text-sm font-bold leading-snug">{cleanName(file[1])}</DialogTitle>
                <DialogDescription className="text-[11px]">
                  {(index as number) + 1} of {items.length}{where ? ` · ${where}` : ""}
                </DialogDescription>
              </div>
              <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={() => onIndexChange((index as number) - 1)}
                  disabled={(index as number) <= 0}
                  aria-label="Previous file"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border disabled:opacity-40"
                ><ChevronLeft className="h-4 w-4" /></button>
                <button
                  type="button"
                  onClick={() => onIndexChange((index as number) + 1)}
                  disabled={(index as number) >= items.length - 1}
                  aria-label="Next file"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border disabled:opacity-40"
                ><ChevronRight className="h-4 w-4" /></button>
                <button type="button" onClick={() => setShowRel((v) => !v)} aria-pressed={showRel} aria-label="Show connected notes and files" className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-bold ${showRel ? "border-primary bg-primary/10 text-primary" : "border-border"}`}><Network className="h-3.5 w-3.5" /><span className="hidden sm:inline">Connected</span></button>
                {!isBroken && (
                  <button
                    type="button"
                    onClick={() => onDownload(file)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90"
                  ><Download className="h-3.5 w-3.5" /> Download</button>
                )}
              </div>
            </div>

            <div className="relative min-h-0 flex-1 bg-muted/30">
              {showRel && (
                <div className="absolute inset-y-0 right-0 z-20 w-full overflow-y-auto border-l border-border bg-card p-3 shadow-xl sm:w-96">
                  <ConnectedLearning key={file[0]} target={{ id: `file:${file[0]}`, title: cleanName(file[1]), where: where ?? "", year: Number((where ?? "").match(/[1-6]/)?.[0]) || null }} onNavigate={() => onIndexChange(null)} />
                </div>
              )}
              {isBroken ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <AlertTriangle className="h-9 w-9 text-amber-500" />
                  <p className="max-w-md text-sm font-semibold text-foreground">This file isn’t available right now.</p>
                  <p className="max-w-md text-xs leading-relaxed text-muted-foreground">It may have been moved, removed, or Google Drive is having trouble. Try the next file, or let us know and we will fix it.</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <a href={reportUrl(file, where)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"><Flag className="h-3.5 w-3.5" /> Report this file</a>
                    {(index as number) < items.length - 1 && <button type="button" onClick={() => onIndexChange((index as number) + 1)} className="rounded-md border border-border px-4 py-2 text-xs font-bold">Next file</button>}
                  </div>
                </div>
              ) : (
                <>
                  {!loaded && canPreview(file[2]) && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-muted/60 text-xs font-semibold text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" /> Opening file…
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
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  ) : canPreview(file[2]) ? (
                    <iframe
                      key={file[0]}
                      src={previewUrl(file[0])}
                      title={cleanName(file[1])}
                      className="h-full w-full border-0"
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

            {!isBroken && canPreview(file[2]) && (
              <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
                Blank or very slow? Google Drive may be busy — try Download, or
                <a href={reportUrl(file, where)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-primary hover:underline"><Flag className="h-3 w-3" /> report this file</a>
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
