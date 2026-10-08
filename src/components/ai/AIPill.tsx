import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { ChevronLeft, X } from "lucide-react";
import OmpathMark from "@/components/ai/OmpathMark";
import { AI_STATE_EVENT, openAI } from "@/lib/aiEvents";

// A see-through bubble for Ompath AI that floats over every page.
//   tap once      -> wakes up (solid, shows its name)       tap again -> opens Ompath AI
//   drag up/down  -> move it out of the way                 drag right, long-press, or tap the x -> tuck into the edge
//   tap the edge tab -> bring it back                       Ctrl+J also opens the AI from the keyboard
const KEY = "ompath_ai_pill";
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function load(): { docked: boolean; y: number } {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "{}"); return { docked: Boolean(v.docked), y: typeof v.y === "number" ? v.y : 96 }; } catch { return { docked: false, y: 96 }; }
}

export default function AIPill() {
  const { pathname } = useLocation();
  const [state, setState] = useState(load);
  const [awake, setAwake] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ id: -1, x0: 0, y0: 0, yStart: 0, moved: false, timer: 0 });
  const sleep = useRef(0);

  const save = (next: { docked: boolean; y: number }) => { setState(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ } };
  const wake = () => { setAwake(true); window.clearTimeout(sleep.current); sleep.current = window.setTimeout(() => setAwake(false), 4000); };
  const dock = () => { setAwake(false); save({ ...state, docked: true }); };

  useEffect(() => {
    const onState = (e: Event) => setPanelOpen(Boolean((e as CustomEvent).detail));
    window.addEventListener(AI_STATE_EVENT, onState);
    return () => { window.removeEventListener(AI_STATE_EVENT, onState); window.clearTimeout(sleep.current); };
  }, []);

  if (panelOpen || pathname === "/ai" || pathname.startsWith("/admin")) return null;

  const onDown = (e: React.PointerEvent) => {
    const d = drag.current;
    d.id = e.pointerId; d.x0 = e.clientX; d.y0 = e.clientY; d.yStart = state.y; d.moved = false;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    window.clearTimeout(d.timer);
    d.timer = window.setTimeout(() => { if (!d.moved) { d.id = -1; dock(); } }, 600); // long-press tucks it away
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) > 8) { d.moved = true; window.clearTimeout(d.timer); setDragging(true); }
    if (d.moved) setState((s) => ({ ...s, y: clamp(d.yStart - dy, 72, window.innerHeight - 120) }));
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d.id !== e.pointerId) return;
    window.clearTimeout(d.timer); d.id = -1; setDragging(false);
    const dx = e.clientX - d.x0;
    if (d.moved) { if (dx > 60) dock(); else save(state); return; }
    if (awake) { setAwake(false); openAI(); } else wake();
  };

  if (state.docked) {
    return (
      <button type="button" onClick={() => { save({ ...state, docked: false }); wake(); }} aria-label="Show Ompath AI" style={{ bottom: state.y }}
        className="fixed right-0 z-40 flex h-16 w-5 items-center justify-center rounded-l-xl border border-r-0 border-border/60 bg-background/50 text-primary opacity-60 shadow-sm backdrop-blur-md transition-opacity hover:opacity-100 focus-visible:opacity-100 print:hidden">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div style={{ bottom: state.y, touchAction: "none" }} className={`fixed right-3 z-40 print:hidden ${dragging ? "" : "transition-[opacity,transform] duration-200"}`}>
      <div className={`flex items-center overflow-hidden rounded-full border shadow-lg backdrop-blur-md ${awake ? "border-indigo-400/50 bg-gradient-to-r from-teal-600 via-indigo-600 to-purple-600 text-white opacity-100 shadow-indigo-500/30" : "border-white/40 bg-background/30 text-foreground opacity-60 hover:opacity-95"}`}>
        <button type="button" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { window.clearTimeout(drag.current.timer); drag.current.id = -1; setDragging(false); }}
          aria-label={awake ? "Open Ompath AI" : "Ompath AI"} className="flex h-12 select-none items-center gap-2 pl-1.5 pr-1.5 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <OmpathMark className="h-9 w-9 shrink-0 drop-shadow" />
          {awake && <span className="whitespace-nowrap pr-2">Ask Ompath AI</span>}
        </button>
        {awake && <button type="button" onClick={dock} aria-label="Hide the Ompath AI bubble" className="flex h-12 w-9 items-center justify-center border-l border-white/25 hover:bg-white/15"><X className="h-4 w-4" /></button>}
      </div>
    </div>
  );
}
