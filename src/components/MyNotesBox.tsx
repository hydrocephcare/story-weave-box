import { useEffect, useRef, useState } from "react";
import { NotebookPen } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { myNoteFor, saveMyNote } from "@/lib/myNotes";

/** "My notes" under a page: type what you want to remember; it saves itself on this device and shows up on /saved. */
export default function MyNotesBox({ title }: { title: string }) {
  const { user } = useAuth();
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const [text, setText] = useState(() => myNoteFor(user?.id, path)?.text ?? "");
  const [open, setOpen] = useState(() => Boolean(myNoteFor(user?.id, path)?.text));
  const [saved, setSaved] = useState(false);
  const timer = useRef(0);
  useEffect(() => { const t = myNoteFor(user?.id, path)?.text ?? ""; setText(t); setOpen(Boolean(t)); }, [path, user?.id]);
  const change = (v: string) => {
    setText(v); setSaved(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { saveMyNote(user?.id, path, title, v); setSaved(true); }, 600);
  };
  return (
    <section className="no-print mt-12 rounded-2xl border border-border bg-muted/30 p-5" aria-label="My notes">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 text-left font-serif text-xl font-bold">
        <NotebookPen className="h-5 w-5 text-primary" aria-hidden /> My notes on this page
        <span className="ml-auto text-sm font-semibold text-muted-foreground">{text.trim() ? "Edit" : open ? "Close" : "Add"}</span>
      </button>
      {open && (
        <>
          <textarea value={text} onChange={(e) => change(e.target.value)} rows={5} maxLength={5000} placeholder="What do you want to remember from this page? Your own words stick better." className="mt-3 w-full resize-y rounded-xl border border-border bg-background p-3 text-[16px] leading-relaxed outline-none focus:border-primary" />
          <p className="mt-1 text-xs text-muted-foreground">{saved ? "Saved on this device." : "Saves by itself. Only you can see it, on this device."}</p>
        </>
      )}
    </section>
  );
}
