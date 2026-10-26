import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Sparkles, Star } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { uploadStoryImage } from "@/lib/storyImage";
import { assistCaption } from "@/lib/storyAssist";
import { cn } from "@/lib/utils";

export type PickedImage = { src: string; alt: string; caption: string; size: "s" | "m" | "l" };

const SIZES: { id: PickedImage["size"]; label: string }[] = [{ id: "s", label: "Small" }, { id: "m", label: "Medium" }, { id: "l", label: "Full width" }];

/** Adding a picture to a story, the way a blog editor does it: choose it, see it, describe it (with help if you want), pick a size, insert. */
export default function StoryImageDialog({ open, onClose, context, onInsert, onUseCover, initialFile }: { initialFile?: File | null; open: boolean; onClose: () => void; context: string; onInsert: (p: PickedImage) => void; onUseCover?: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [size, setSize] = useState<PickedImage["size"]>("l");
  useEffect(() => {
    if (!open) return;
    setSrc(""); setName(""); setAlt(""); setCaption(""); setSize("l");
    // a picture dropped or pasted into the story, or the picker opened straight away, so adding one is a single step
    if (initialFile) void pick(initialFile); else window.setTimeout(() => fileRef.current?.click(), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile]);

  /** The AI's arrangement: wide pictures run full width, tall ones are centred at a medium size, and a caption is written from the nearby text. */
  const arrange = async (url: string, fileName: string) => {
    try {
      const dims = await new Promise<{ w: number; h: number }>((res, rej) => { const im = new window.Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = rej; im.src = url; });
      setSize(dims.h > dims.w * 1.15 ? "m" : "l");
    } catch { /* keep full width */ }
    setAiBusy(true);
    try { const t = await assistCaption(context, fileName); if (t) { setCaption(t); setAlt(t); } } catch { /* the writer can type a caption */ }
    finally { setAiBusy(false); }
  };

  const pick = async (f: File) => {
    setBusy(true);
    try { const url = await uploadStoryImage(f); setSrc(url); setName(f.name); void arrange(url, f.name); }
    catch (e) { toast({ title: "Picture not added", description: (e as Error).message, variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const suggest = async () => {
    setAiBusy(true);
    try { const t = await assistCaption(context, name); setCaption(t); if (!alt) setAlt(t); }
    catch (e) { toast({ title: "No suggestion", description: (e as Error).message, variant: "destructive" }); }
    finally { setAiBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-lg gap-0 overflow-y-auto p-0 sm:rounded-2xl">
        <div className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="font-serif text-xl font-bold">Add a picture</DialogTitle>
          <DialogDescription className="mt-0.5 text-xs">Choose it and we arrange it: size, caption and description are filled in for you. It goes where your cursor is, and you keep typing after it.</DialogDescription>
        </div>
        <div className="space-y-4 px-5 py-4">
          {src ? (
            <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
              <img src={src} alt={alt} className="mx-auto max-h-60 w-auto object-contain" />
              <button type="button" onClick={() => fileRef.current?.click()} className="block w-full border-t border-border py-2 text-xs font-bold text-primary">Choose a different picture</button>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground hover:border-primary hover:text-primary">
              {busy ? <Loader2 className="h-7 w-7 animate-spin" /> : <ImagePlus className="h-7 w-7" />}
              <strong className="text-foreground">{busy ? "Uploading…" : "Choose a picture"}</strong>
              <span className="text-xs">From your phone or computer. Big pictures are made smaller for you.</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />

          {src && (
            <>
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label htmlFor="img-caption" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Caption <span className="font-medium normal-case tracking-normal">(optional)</span></label>
                  <button type="button" onClick={() => void suggest()} disabled={aiBusy} className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-bold text-primary disabled:opacity-50">{aiBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Suggest from my story</button>
                </div>
                <input id="img-caption" value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 160))} placeholder="One line under the picture" className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label htmlFor="img-alt" className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">Describe it <span className="font-medium normal-case tracking-normal">(for screen readers and search)</span></label>
                <input id="img-alt" value={alt} onChange={(e) => setAlt(e.target.value.slice(0, 160))} placeholder="What is in the picture?" className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Size</p>
                <div className="flex gap-1.5">{SIZES.map((s) => <button key={s.id} type="button" onClick={() => setSize(s.id)} aria-pressed={size === s.id} className={cn("flex-1 rounded-full border px-3 py-2 text-sm font-bold transition-colors", size === s.id ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{s.label}</button>)}</div>
              </div>
              {onUseCover && <button type="button" onClick={() => { onUseCover(src); toast({ title: "Set as your cover picture" }); }} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary"><Star className="h-4 w-4" /> Also use it as my cover picture</button>}
            </>
          )}
        </div>
        <div className="flex gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold">Cancel</button>
          <button type="button" disabled={!src || busy} onClick={() => { onInsert({ src, alt: alt.trim(), caption: caption.trim(), size }); onClose(); }} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40">{aiBusy ? "Arranging…" : "Insert into story"}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
