// Privacy-preserving visitor counts: pseudonymous browser/account keys are used only for unique and returning totals.
// Page paths and device categories are written to grouped aggregates, never attached to an individual visitor. No IPs or browser fingerprints are collected.
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
const device = () => deviceKind();

let off = false;
async function send(path: string, beat: boolean) {
  if (off || isBot()) return;
  const visitor = visitorId();
  if (!visitor) return;
  try {
    const { error } = await (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ error: { code?: string } | null }> })
      .rpc("track_visit", { p_visitor: visitor, p_path: path.slice(0, 200), p_device: device(), p_ref: null, p_beat: beat });
    if (error && (error.code === "PGRST202" || error.code === "42883")) off = true;
  } catch { /* counting must never get in the way */ }
}

/** Record submitted searches and learning interactions; never collect MCQ question or answer text. */
export async function trackEngagement(eventName: "search" | "course_open" | "resource_open" | "mcq_answer" | "flashcard_review" | "exam_start" | "exam_complete", properties: Record<string, unknown> = {}) {
  if (off || isBot()) return;
  try {
    await (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<unknown> })
      .rpc("track_site_event", { p_visitor: "aggregate-only", p_event_name: eventName, p_path: window.location.pathname.slice(0, 200), p_properties: properties });
  } catch { /* analytics must never interrupt study */ }
}

/** Mount once, inside the router. */
export function useVisitCounter() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const last = useRef({ path: "", at: 0 });
  useEffect(() => {
    if (pathname.startsWith("/admin") && !user) return;
    const now = Date.now();
    if (last.current.path === pathname && now - last.current.at < 20_000) return;
    last.current = { path: pathname, at: now };
    void send(pathname, false);
  }, [pathname, user?.id]);
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === "visible" && (!window.location.pathname.startsWith("/admin") || user)) void send(window.location.pathname, true); }, 60_000);
    return () => window.clearInterval(t);
  }, [user?.id]);
}
