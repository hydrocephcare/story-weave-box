import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";

/**
 * Tap a picture in a note and it opens full screen: pinch, scroll or double-tap to zoom, drag to move around, with its caption under it.
 * One listener for the whole site, so every note picture works without each page doing anything.
 */
export default function ImageLightbox() {
  const [pic, setPic] = useState<{ src: string; caption: string } | null>(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const g = useRef<{ pts: Map<number, { x: number; y: number }>; d0: number; s0: number; moved: boolean; last: number }>({ pts: new Map(), d0: 0, s0: 1, moved: false, last: 0 });

  const reset = useCallback(() => { setScale(1); setPos({ x: 0, y: 0 }); }, []);
  const close = useCallback(() => { setPic(null); reset(); }, [reset]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || el.tagName !== "IMG") return;
      const img = el as HTMLImageElement;
      if (img.closest("a, button, nav, footer, [data-nozoom]") || !img.closest("main, article, .note-body")) return;
      const r = img.getBoundingClientRect();
      if (r.width < 160 || r.height < 90) return;
      const fig = img.closest("figure");
      const caption = (fig?.querySelector("figcaption")?.textContent || img.alt || "").trim();
      e.preventDefault();
      setPic({ src: img.currentSrc || img.src, caption }); reset();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [reset]);

  useEffect(() => {
    if (!pic) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); else if (e.key === "+" || e.key === "=") setScale((s) => Math.min(6, s * 1.3)); else if (e.key === "-") setScale((s) => Math.max(1, s / 1.3)); };
    window.addEventListener("keydown", key);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", key); document.body.style.overflow = prev; };
  }, [pic, close]);

  if (!pic) return null;
  const dist = () => { const p = [...g.current.pts.values()]; return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
  const down = (e: React.PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); g.current.pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); g.current.moved = false; if (g.current.pts.size === 2) { g.current.d0 = dist(); g.current.s0 = scale; } };
  const move = (e: React.PointerEvent) => {
    const m = g.current; const p = m.pts.get(e.pointerId); if (!p) return;
    if (m.pts.size === 2) { m.pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (m.d0) setScale(Math.max(1, Math.min(6, (m.s0 * dist()) / m.d0))); m.moved = true; return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; m.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (Math.abs(dx) + Math.abs(dy) > 1) m.moved = true;
    if (scale > 1) setPos((o) => ({ x: o.x + dx, y: o.y + dy }));
  };
  const up = (e: React.PointerEvent) => {
    const m = g.current; m.pts.delete(e.pointerId);
    if (!m.moved && m.pts.size === 0) { const now = Date.now(); if (now - m.last < 300) { if (scale > 1) reset(); else setScale(2.6); m.last = 0; } else m.last = now; }
  };
  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-black/90" role="dialog" aria-modal="true" aria-label="Picture">
      <div className="flex items-center justify-end gap-1 p-3 text-white">
        <button type="button" onClick={() => setScale((s) => Math.max(1, s / 1.4))} aria-label="Zoom out" className="rounded-full p-2.5 hover:bg-white/15"><Minus className="h-5 w-5" /></button>
        <button type="button" onClick={() => setScale((s) => Math.min(6, s * 1.4))} aria-label="Zoom in" className="rounded-full p-2.5 hover:bg-white/15"><Plus className="h-5 w-5" /></button>
        <button type="button" onClick={close} aria-label="Close picture" className="rounded-full p-2.5 hover:bg-white/15"><X className="h-6 w-6" /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden" style={{ touchAction: "none" }} onClick={(e) => { if (e.target === e.currentTarget && scale === 1) close(); }} onWheel={(e) => setScale((s) => Math.max(1, Math.min(6, s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))))}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <img src={pic.src} alt={pic.caption} draggable={false} className="max-h-full max-w-full select-none object-contain" style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, transition: g.current.pts.size ? "none" : "transform 120ms ease-out", cursor: scale > 1 ? "grab" : "zoom-in" }} />
      </div>
      {pic.caption && <p className="max-h-[22dvh] overflow-y-auto px-5 pb-5 pt-3 text-center text-sm leading-snug text-white/85">{pic.caption}</p>}
    </div>
  );
}
