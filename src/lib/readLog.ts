// Notes a student really read: a page counts once they have spent a few active minutes on it, not when it was merely opened and left.
// Kept on this device per account; only the student's own weekly assessment uses it.
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

export interface ReadEntry { t: string; p: string; at: number; secs: number }
export const READ_SECONDS = 150; // two and a half active minutes on a long page; a short page needs less (see needSeconds)
const MIN_DEPTH = 0.35; // and the student must have scrolled through at least a third of the page
const keyFor = (uid: string | null | undefined) => `ompath_read_${uid ?? "guest"}`;

export function readsThisWeek(uid: string | null | undefined): ReadEntry[] {
  try {
    const all = JSON.parse(localStorage.getItem(keyFor(uid)) ?? "[]") as ReadEntry[];
    return all.filter((e) => e.at > Date.now() - 7 * 86_400_000);
  } catch { return []; }
}

/** Every page this student has really read on this device (not only this week), newest first. */
export function allReads(uid: string | null | undefined): ReadEntry[] {
  try { return JSON.parse(localStorage.getItem(keyFor(uid)) ?? "[]") as ReadEntry[]; } catch { return []; }
}

function record(uid: string | null | undefined, e: ReadEntry) {
  try {
    const all = (JSON.parse(localStorage.getItem(keyFor(uid)) ?? "[]") as ReadEntry[]).filter((x) => x.p !== e.p);
    localStorage.setItem(keyFor(uid), JSON.stringify([e, ...all].slice(0, 80)));
  } catch { /* storage blocked */ }
}

/** Counts the seconds the page is visible AND the student is active (scrolling, tapping, typing); logs the page once it passes READ_SECONDS. */
export function useReadLog(title: string | null | undefined) {
  const { user } = useAuth();
  const uid = user?.id;
  useEffect(() => {
    if (!title) return;
    const path = window.location.pathname;
    let secs = 0, last = Date.now(), logged = false, depth = 0;
    const measure = () => { const h = document.documentElement.scrollHeight - window.innerHeight; depth = Math.max(depth, h > 0 ? window.scrollY / h : 1); };
    // a short page is read sooner than a long one: about 40% of the time its words need at 200 words a minute, never under a minute, never over READ_SECONDS
    const needSeconds = () => Math.min(READ_SECONDS, Math.max(60, Math.round(((document.querySelector("main")?.innerText.length ?? 6000) / 6 / 200) * 60 * 0.4)));
    const touch = () => { last = Date.now(); };
    const tick = window.setInterval(() => {
      if (document.visibilityState !== "visible" || Date.now() - last > 45_000) return; // away or idle
      secs += 5;
      measure();
      if (!logged && secs >= needSeconds() && depth >= MIN_DEPTH) { logged = true; record(uid, { t: title.slice(0, 120), p: path, at: Date.now(), secs }); }
    }, 5000);
    const ev = ["scroll", "pointerdown", "keydown", "touchmove"] as const;
    ev.forEach((n) => window.addEventListener(n, touch, { passive: true }));
    return () => { window.clearInterval(tick); ev.forEach((n) => window.removeEventListener(n, touch)); };
  }, [title, uid]);
}
