import { useEffect, useState } from "react";

/** Which section the reader is in (the last heading that has reached the top of the screen) and how far down the text they are, 0 to 100. */
export function useScrollSpy(ids: string[], bodySelector = ".note-body, main") {
  const [active, setActive] = useState("");
  const [progress, setProgress] = useState(0);
  const key = ids.join("|");
  useEffect(() => {
    if (!ids.length) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= 150) current = id; else break;
      }
      setActive(current);
      const body = document.querySelector(bodySelector);
      if (body) {
        const r = body.getBoundingClientRect();
        const total = Math.max(1, r.height - window.innerHeight * 0.6);
        setProgress(Math.max(0, Math.min(100, Math.round(((150 - r.top) / total) * 100))));
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, bodySelector]);
  return { active, progress };
}
