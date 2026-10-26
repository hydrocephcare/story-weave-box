import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase-config";

// Errors a visitor hits are sent to the admin automatically (table client_errors, readable only by the admin).
// It is quiet by design: a few reports a minute at most, the same message once, and never a reason for the page itself to fail.
const sent = new Map<string, number>();
let recent: number[] = [];

const IGNORE = /ResizeObserver loop|Script error|Non-Error promise rejection|The operation was aborted|AbortError|NetworkError when attempting|Failed to fetch$|Load failed$|chrome-extension|moz-extension|safari-extension|webkit-masked-url/i;

export function reportError(source: string, error: unknown, extra?: Record<string, unknown>) {
  try {
    const message = String((error as { message?: string })?.message ?? error ?? "").replace(/\s+/g, " ").trim().slice(0, 580);
    if (!message || IGNORE.test(message)) return;
    const now = Date.now();
    const key = `${source}|${message}`;
    if ((sent.get(key) ?? 0) > now - 10 * 60_000) return;
    recent = recent.filter((t) => now - t < 60_000);
    if (recent.length >= 4) return;
    sent.set(key, now); recent.push(now);
    let token = "";
    let uid: string | null = null;
    try { const raw = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k)); if (raw) { const s = JSON.parse(localStorage.getItem(raw) ?? "{}"); token = s.access_token ?? ""; uid = s.user?.id ?? null; } } catch { /* signed out */ }
    void fetch(`${SUPABASE_URL}/rest/v1/client_errors`, {
      method: "POST",
      keepalive: true,
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token || SUPABASE_PUBLISHABLE_KEY}`, "content-type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ source: source.slice(0, 80), message, url: location.href.slice(0, 300), user_id: uid, user_agent: navigator.userAgent.slice(0, 300), extra: extra ?? null }),
    }).catch(() => undefined);
  } catch { /* reporting must never break anything */ }
}

let installed = false;
/** Catches errors nobody handled anywhere on the site. */
export function installErrorReporting() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => { if (e.message) reportError("window", e.message, { file: String(e.filename ?? "").slice(-80), line: e.lineno }); });
  window.addEventListener("unhandledrejection", (e) => reportError("promise", (e.reason as { message?: string })?.message ?? e.reason));
}
