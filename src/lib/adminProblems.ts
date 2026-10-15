/** Remembers the last few things that went wrong while an admin was working (failed requests, uncaught errors), so the admin assistant can explain them and work around them. */
export interface Problem { at: string; what: string }
const MAX = 8;
const seen: Problem[] = [];
let installed = false;

const add = (what: string) => { seen.push({ at: new Date().toISOString(), what: what.slice(0, 300) }); if (seen.length > MAX) seen.shift(); };

export function installProblemWatch() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => add(`Error: ${e.message}`));
  window.addEventListener("unhandledrejection", (e) => add(`Failed: ${String((e.reason as { message?: string })?.message ?? e.reason)}`));
  const real = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const res = await real(...args);
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].href : (args[0] as Request).url;
      if (!res.ok && /\/(functions|rest|rpc)\/v1\/|\/api\//.test(url) && !/track_visit/.test(url)) {
        const text = await res.clone().text().catch(() => "");
        add(`${res.status} from ${url.replace(/^https?:\/\/[^/]+/, "").split("?")[0]}: ${text.slice(0, 160)}`);
      }
    } catch { /* never break a request because of the watcher */ }
    return res;
  };
}

export const recentProblems = (): Problem[] => seen.slice();
/** Forget what was shown, so the red number on the Assistant button goes away until something new fails. */
export const clearProblems = () => { seen.length = 0; };
