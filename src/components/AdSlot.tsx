import { useEffect, useRef } from "react";
import { useAccess } from "@/lib/access";
import { openSubscribePrompt } from "@/lib/subscribe-prompt";
import { useMonetise } from "@/lib/monetise";

let scriptFor = "";
function ensureScript(client: string) {
  if (scriptFor === client) return;
  scriptFor = client;
  const s = document.createElement("script");
  s.async = true; s.crossOrigin = "anonymous";
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  document.head.appendChild(s);
}

/**
 * One quiet advertising slot for a blog page. It shows nothing at all unless the admin has turned ads on, never to a subscriber or the
 * admin, and never to a crawler. Place it between sections, never inside a quiz or an exam.
 */
export default function AdSlot({ className = "" }: { className?: string }) {
  const { ads } = useMonetise();
  const { hasPass, unlocked, loading } = useAccess();
  const ref = useRef<HTMLModElement | null>(null);
  const allowed = ads.enabled && /^ca-pub-\d+$/.test(ads.client) && /^\d+$/.test(ads.slot) && !hasPass && !loading && typeof navigator !== "undefined" && !/bot|crawl|spider|headless|lighthouse/i.test(navigator.userAgent);
  useEffect(() => {
    if (!allowed || !ref.current || ref.current.dataset.filled) return;
    ensureScript(ads.client);
    try { ((window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle ||= []).push({}); ref.current.dataset.filled = "1"; } catch { /* blocked by an ad blocker */ }
  }, [allowed, ads.client]);
  void unlocked;
  if (!allowed) return null;
  return (
    <aside className={`my-10 print:hidden ${className}`} aria-label="Advertisement">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Advertisement</p>
      <ins ref={ref} className="adsbygoogle block" style={{ display: "block", minHeight: 100 }} data-ad-client={ads.client} data-ad-slot={ads.slot} data-ad-format="auto" data-full-width-responsive="true" />
      <button type="button" onClick={() => openSubscribePrompt("Subscribe to use Ompath Study without ads.")} className="mt-1.5 text-xs font-semibold text-primary hover:underline">Go ad-free with Pro</button>
    </aside>
  );
}
