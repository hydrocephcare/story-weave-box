import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

/** The script file the page is running on, from its own markup ("/assets/index-AbC123.js"). */
const scriptOf = (html: string) => html.match(/<script[^>]+type="module"[^>]+src="([^"]*\/assets\/index-[^"]+\.js)"/)?.[1] ?? html.match(/src="([^"]*\/assets\/index-[^"]+\.js)"/)?.[1] ?? "";

/**
 * Students keep Ompath Study open (or installed) for days, and an old copy keeps running old code after a fix goes live.
 * This quietly checks for a newer version when the student comes back to the tab, and offers a one-tap refresh.
 * It never reloads on its own, so nothing a student is typing is lost.
 */
export default function UpdateNotifier() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    const running = scriptOf(document.documentElement.innerHTML);
    if (!running) return;
    let last = 0;
    const check = async () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 10 * 60 * 1000) return;
      last = Date.now();
      try {
        const res = await fetch("/index.html", { cache: "no-store" });
        const latest = scriptOf(await res.text());
        if (latest && latest !== running) setStale(true);
      } catch { /* offline: nothing to check */ }
    };
    const t = window.setTimeout(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => { window.clearTimeout(t); document.removeEventListener("visibilitychange", check); };
  }, []);

  if (!stale) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-border bg-foreground px-4 py-3 text-background shadow-xl print:hidden">
      <p className="min-w-0 flex-1 text-sm font-semibold">A newer version of Ompath Study is ready.</p>
      <button type="button" onClick={() => window.location.reload()} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-background px-3 py-2 text-xs font-bold text-foreground"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      <button type="button" onClick={() => setStale(false)} aria-label="Later" className="shrink-0 text-xs font-semibold opacity-70 hover:opacity-100">Later</button>
    </div>
  );
}
