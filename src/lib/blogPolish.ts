// The polished copy of a Year 1 to 3 blog (clear title, search description, tidier text), made by the server the first time anyone opens the page
// and kept for everyone (table blog_polish, see /api/ai-polish). The stored article is never changed. Nothing here may break a page: every step
// that fails simply leaves the page as it was.
import { supabase } from "@/integrations/supabase/client";

export interface Polish { title: string | null; description: string | null; content: string | null; verdict: string | null; status: string }

/** Pages whose polished copy has been applied: the rule-tidied copy must not replace it afterwards. */
export const polishedIds = new Set<string>();

const KEY = "ompath_polish_v1";
const mem = new Map<string, Polish | null>();

const readStored = (id: string): Polish | null | undefined => {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, { at: number; v: Polish | null }>;
    const hit = all[id];
    if (!hit) return undefined;
    // a finished polish is kept a day; "nothing yet" only a few minutes, so a page polished meanwhile shows up soon
    if (Date.now() - hit.at > (hit.v ? 86_400_000 : 300_000)) return undefined;
    return hit.v;
  } catch { return undefined; }
};
const store = (id: string, v: Polish | null) => {
  mem.set(id, v);
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, { at: number; v: Polish | null }>;
    const keys = Object.keys(all);
    if (keys.length > 150) for (const k of keys.slice(0, 50)) delete all[k];
    all[id] = { at: Date.now(), v: v ? { ...v, content: v.content } : null };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* storage full or blocked: the page still works */ }
};

export const wantsPolish = (a: { category?: string | null; password_protected?: boolean | null }) =>
  /^Year\s*[1-6]\b/i.test(a.category ?? "") && !a.password_protected;

/** The saved polished copy, or null when there is none yet. `fresh` skips what this device remembers. */
export async function getPolish(id: string, fresh = false): Promise<Polish | null> {
  if (!fresh) {
    if (mem.has(id)) return mem.get(id) ?? null;
    const s = readStored(id);
    if (s !== undefined) { mem.set(id, s); return s; }
  }
  try {
    const { data, error } = await (supabase as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: Polish | null; error: unknown }> } } } })
      .from("blog_polish").select("title,description,content,verdict,status").eq("article_id", id).maybeSingle();
    if (error) return null; // the table may not exist yet: the page carries on as before
    const row = data && (data.status === "done" || data.status === "partial") ? data : null;
    store(id, row);
    return row;
  } catch { return null; }
}

/** Ask the server to polish this blog (it does it once for everyone). Returns the server's status, or "" when nothing was asked. */
export async function requestPolish(id: string): Promise<string> {
  if (typeof navigator === "undefined" || navigator.webdriver || /bot|crawl|spider|slurp|headless|lighthouse/i.test(navigator.userAgent)) return "";
  try { if (sessionStorage.getItem(`ompath_polish_asked_${id}`)) return ""; sessionStorage.setItem(`ompath_polish_asked_${id}`, "1"); } catch { /* ignore */ }
  try {
    const r = await fetch("/api/ai-polish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    if (!r.ok) return "";
    const j = (await r.json().catch(() => ({}))) as { status?: string };
    return j.status ?? "";
  } catch { return ""; }
}

/** The article with its polished title, description and text laid over it. */
export function applyPolish<T extends { id: string; title?: string | null; content: string; meta_title?: string | null; meta_description?: string | null }>(a: T, p: Polish): T {
  const out: T = { ...a };
  if (p.title) { out.title = p.title; out.meta_title = p.title; }
  if (p.description) out.meta_description = p.description;
  if (p.content && p.content.trim().length > 200) { out.content = p.content; polishedIds.add(a.id); }
  return out;
}
