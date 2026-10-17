/**
 * Tiny global bus for the subscription prompt. Any locked control (a Reveal
 * button, a download button) can ask for the modal without prop plumbing.
 */
const EVENT = "ompath:subscribe";
const SNOOZE_KEY = "ompath_subscribe_snooze";

/** Asked of anything that is open on top of the page (the Ompath AI panel, a note pop-up) to get out of the way. */
export const CLOSE_OVERLAYS_EVENT = "ompath:close-overlays";

/**
 * A pop-up from the page (Radix) locks the rest of the screen: clicks and scrolling outside it are ignored. The subscription prompt is outside
 * every such pop-up, so opening it on top of one froze it. Close what is open first, then let the lock release.
 */
export function clearOverlays() {
  window.dispatchEvent(new Event(CLOSE_OVERLAYS_EVENT));
  if (document.body.style.pointerEvents === "none") {
    // some other pop-up is still locking the screen: press Escape for the student
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }
}

export function openSubscribePrompt(_reason?: string) {
  // Subscriptions are disabled; no learner should be interrupted by a paywall.
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

/** Kept as a no-op for older callers; subscription prompts are disabled. */
export function useScrollSubscribePrompt(_active: boolean, _opts?: { every?: number; max?: number; gapMs?: number }) {
  // Intentionally disabled: all OmpathStudy content and features are free.
}
