// The polished copy of a Year 1 to 3 blog (clear title, search description, tidier text), made by the server the first time anyone opens the page
// and kept for everyone (table blog_polish, see /api/ai-polish). The stored article is never changed. Nothing here may break a page: every step
// that fails simply leaves the page as it was.
import { supabase } from "@/integrations/supabase/client";

export interface Polish { title: string | null; description: string | null; content: string | null; image_query?: string | null; reason?: string | null; verdict: string | null; status: string }

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
    const table = supabase as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: Polish | null; error: unknown }> } } } };
    let { data, error } = await table.from("blog_polish").select("title,description,content,image_query,reason,verdict,status").eq("article_id", id).maybeSingle();
    // a table made before the picture column existed: ask again without it
    if (error) ({ data, error } = await table.from("blog_polish").select("title,description,content,reason,verdict,status").eq("article_id", id).maybeSingle());
    if (error) return null; // the table may not exist yet: the page carries on as before
    const row = data && (data.status === "done" || data.status === "partial") ? data : null;
    store(id, row);
    return row;
  } catch { return null; }
}

/**
 * Ask the server to polish this blog (it does it once for everyone, only when someone opens it). A long page is done a couple of pieces per
 * request, so `more` tells the page to ask again. `again` is for those follow-up asks. Returns { status: "" } when nothing was asked.
 */
export async function requestPolish(id: string, again = false): Promise<{ status: string; more: boolean; progress: string }> {
  const none = { status: "", more: false, progress: "" };
  if (typeof navigator === "undefined" || navigator.webdriver || /bot|crawl|spider|slurp|headless|lighthouse/i.test(navigator.userAgent)) return none;
  if (!again) { try { if (sessionStorage.getItem(`ompath_polish_asked_${id}`)) return none; sessionStorage.setItem(`ompath_polish_asked_${id}`, "1"); } catch { /* ignore */ } }
  try {
    const r = await fetch("/api/ai-polish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    if (!r.ok) return none;
    const j = (await r.json().catch(() => ({}))) as { status?: string; more?: boolean; progress?: string };
    return { status: j.status ?? "", more: Boolean(j.more), progress: j.progress ?? "" };
  } catch { return none; }
}

/** The article with its polished title, description and text laid over it. */
export function applyPolish<T extends { id: string; title?: string | null; content: string; meta_title?: string | null; meta_description?: string | null }>(a: T, p: Polish): T {
  const out: T = { ...a };
  if (p.title) { out.title = p.title; out.meta_title = p.title; }
  if (p.description) out.meta_description = p.description;
  if (p.image_query) (out as { image_query?: string }).image_query = p.image_query;
  // the text only replaces the page when the whole page is done (a long page is polished a few pieces at a time)
  if (p.status === "done" && p.content && p.content.trim().length > 200) { out.content = p.content; polishedIds.add(a.id); }
  return out;
}
