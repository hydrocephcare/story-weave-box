import { useState } from "react";
import { ScanLine } from "lucide-react";
import DriveFileViewer, { type DriveFile } from "@/components/DriveFileViewer";
import { startDownload } from "@/lib/driveDownload";

/** "Scan": opens the original scanned PDF a paper was typed up from, in the reader pop-up. */
export default function PaperScanButton({ driveId, name, className = "" }: { driveId: string | null; name?: string; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!driveId) return null;
  const items: DriveFile[] = [[driveId, name || "Original scan", "pdf"]];
  return (
    <>
      <button type="button" onClick={() => setOpen(0)} aria-label="View the original scanned paper" className={`inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-xs font-bold text-primary hover:bg-primary/10 ${className}`}>
        <ScanLine className="h-3.5 w-3.5" /> Original scan
      </button>
      <DriveFileViewer items={items} index={open} onIndexChange={setOpen} onDownload={(f) => startDownload(f[0], f[1])} where="Past papers" />
    </>
  );
}
