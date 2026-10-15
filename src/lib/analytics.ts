// Counts visits so the admin can see how many people use the site: one random id per device (no name, e-mail or IP address), one row per page
// view, and a quiet "still here" signal every minute while a page is open. Crawlers and the admin pages are not counted.
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const ID_KEY = "ompath_vid";
const isBot = () => typeof navigator === "undefined" || /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp|telegram/i.test(navigator.userAgent) || (navigator as Navigator & { webdriver?: boolean }).webdriver === true;

function visitorId(): string {
  try {
    let v = localStorage.getItem(ID_KEY);
    if (!v || v.length < 8) { v = (crypto.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/-/g, "").slice(0, 32); localStorage.setItem(ID_KEY, v); }
    return v;
  } catch { return ""; }
}
const deviceKind = () => (window.innerWidth < 768 ? "phone" : window.innerWidth < 1100 ? "tablet" : "desktop");
/** What kind of computer this is, whatever browser is open: system, screen size, time zone and language (not the browser, so Chrome and Edge on one laptop match). */
const machineHint = () => {
  try {
    const ua = navigator.userAgent;
    const os = /Windows/i.test(ua) ? "win" : /Android/i.test(ua) ? "android" : /iPhone|iPad|iOS/i.test(ua) ? "ios" : /Mac OS/i.test(ua) ? "mac" : /Linux/i.test(ua) ? "linux" : "other";
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    return `${os}|${Math.max(screen.width, screen.height)}x${Math.min(screen.width, screen.height)}|${tz}|${(navigator.language ?? "").slice(0, 5)}`;
  } catch { return ""; }
};
const device = () => `${deviceKind()}~${machineHint()}`;
const outsideReferrer = () => { try { const h = new URL(document.referrer).hostname; return h && !h.endsWith("ompathstudy.com") ? h : ""; } catch { return ""; } };

let off = false; // the counting functions are not in the database yet: stay quiet
async function send(path: string, beat: boolean) {
  if (off || isBot()) return;
  const visitor = visitorId();
  if (!visitor) return;
  try {
    const { error } = await (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ error: { code?: string } | null }> })
      .rpc("track_visit", { p_visitor: visitor, p_path: path.slice(0, 200), p_device: device(), p_ref: beat ? null : outsideReferrer(), p_beat: beat });
    if (error && (error.code === "PGRST202" || error.code === "42883")) off = true;
  } catch { /* counting must never get in the way */ }
}

/** Mount once, inside the router. */
export function useVisitCounter() {
  const { pathname } = useLocation();
  const last = useRef({ path: "", at: 0 });
  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    const now = Date.now();
    if (last.current.path === pathname && now - last.current.at < 20_000) return;
    last.current = { path: pathname, at: now };
    void send(pathname, false);
  }, [pathname]);
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === "visible" && !window.location.pathname.startsWith("/admin")) void send(window.location.pathname, true); }, 60_000);
    return () => window.clearInterval(t);
  }, []);
}
