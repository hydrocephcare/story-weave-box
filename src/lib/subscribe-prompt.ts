import { useEffect, useRef } from "react";

/**
 * Tiny global bus for the subscription prompt. Any locked control (a Reveal
 * button, a download button) can ask for the modal without prop plumbing.
 */
const EVENT = "ompath:subscribe";
const SNOOZE_KEY = "ompath_subscribe_snooze";

export function openSubscribePrompt(reason?: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { reason } }));
}

export function onSubscribePrompt(handler: (reason?: string) => void) {
  const listener = (e: Event) => handler((e as CustomEvent).detail?.reason);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export function snoozeSubscribePrompt(minutes = 20) {
  try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + minutes * 60_000)); } catch { /* ignore */ }
}

function isSnoozed(): boolean {
  try { return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now(); } catch { return false; }
}

/**
 * Scroll-driven nudge: while a guest reads a paper with MCQs, open the
 * subscription prompt each time they pass another chunk of the page.
 * Capped, spaced out in time, and silenced after "maybe later".
 */
export function useScrollSubscribePrompt(active: boolean, opts?: { every?: number; max?: number; gapMs?: number }) {
  const step = opts?.every ?? 0.28;
  const max = opts?.max ?? 3;
  const gapMs = opts?.gapMs ?? 45_000;
  const shown = useRef(0);
  const lastAt = useRef(0);
  const nextAt = useRef(step);

  useEffect(() => {
    if (!active) return;
    lastAt.current = Date.now();
    const onScroll = () => {
      if (shown.current >= max || isSnoozed()) return;
      const doc = document.documentElement;
      const max_scroll = doc.scrollHeight - window.innerHeight;
      if (max_scroll < 400) return;
      const progress = window.scrollY / max_scroll;
      if (progress < nextAt.current) return;
      if (Date.now() - lastAt.current < gapMs) return;
      shown.current += 1;
      lastAt.current = Date.now();
      nextAt.current = Math.min(0.95, progress + step);
      openSubscribePrompt("Subscribe to reveal the verified answers on this paper.");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [active, step, max, gapMs]);
}