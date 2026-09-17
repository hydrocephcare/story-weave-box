/**
 * Remembers that a reader wanted to subscribe before they were signed in.
 * Google sign-in always returns to the site origin, so we park the page they
 * came from here and resume the payment popup once the session is live.
 */
const KEY = "ompath_purchase_intent";

export type PurchaseIntent = { path: string; plan?: string; at: number };

export function savePurchaseIntent(plan?: string) {
  try {
    const path = `${window.location.pathname}${window.location.search}`;
    localStorage.setItem(KEY, JSON.stringify({ path, plan, at: Date.now() } satisfies PurchaseIntent));
  } catch { /* ignore */ }
}

/** Reads and clears the intent. Intents older than 30 minutes are dropped. */
export function takePurchaseIntent(): PurchaseIntent | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const intent = JSON.parse(raw) as PurchaseIntent;
    if (!intent?.path || Date.now() - (intent.at || 0) > 30 * 60_000) return null;
    return intent;
  } catch { return null; }
}

export function clearPurchaseIntent() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
