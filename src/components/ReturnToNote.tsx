import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";
import { clearNoteReturn, getNoteReturn, setNoteReturn, useNoteReturn } from "@/lib/noteReturn";

/** After following a link out of a note, a button that takes you back to the note, to the spot you were reading. */
export default function ReturnToNote() {
  const ret = useNoteReturn();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  // Reaching a topic page from anywhere (a blog, a note, a list) leaves a "Back to <that page>" button at the spot you were reading
  const here = useRef({ path: "", title: "", y: 0 });
  useEffect(() => {
    const path = `${pathname}${search}`;
    const prev = here.current;
    if (pathname.startsWith("/topic/") && prev.path && prev.path !== path && !prev.path.startsWith("/topic/") && !getNoteReturn()) setNoteReturn({ path: prev.path, title: prev.title || "the page you were on", y: prev.y });
    here.current = { path, title: "", y: 0 };
    const grab = () => { here.current.y = window.scrollY; here.current.title = document.title.split(" | ")[0].split(" — ")[0]; };
    grab();
    window.addEventListener("scroll", grab, { passive: true });
    return () => window.removeEventListener("scroll", grab);
  }, [pathname, search]);

  if (!ret || `${pathname}${search}` === ret.path || pathname === ret.path) return null;

  return (
    <div className="fixed bottom-4 left-3 z-40 flex max-w-[calc(100vw-5.5rem)] items-center overflow-hidden rounded-full border border-border bg-foreground text-background shadow-lg print:hidden">
      <button type="button" onClick={() => navigate(ret.path, { state: { restore: true } })} className="flex min-w-0 items-center gap-1.5 py-2.5 pl-3.5 pr-2 text-xs font-bold" aria-label={`Back to ${ret.title}`}>
        <ArrowLeft className="h-4 w-4 shrink-0" /> <span className="truncate">Back to {ret.title}</span>
      </button>
      <button type="button" onClick={clearNoteReturn} aria-label="Dismiss" className="py-2.5 pl-1 pr-3 opacity-70 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}
