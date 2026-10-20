// What a student does should follow their email, not their device: the small habits kept in the browser (cards done today, starred cards, practice scores,
// text size, which years to show ...) are copied to their account while they are signed in and brought back on another device. Reading progress and the card
// schedule already live in their own tables. A different person on the same browser never inherits them (see signOutCleanup).
import { supabase } from "@/integrations/supabase/client";

const EXACT = ["deck-typed", "ompath_books_saved", "ompath_books_recent", "ompath_books_read", "ompath_saved_files", "ompath_recent_files", "ompath_recent_topics", "ompath_recent_searches", "deck-daily", "deck-stars", "deck-buried", "deck-scale", "ompath_all_years", "ompath_milestones", "ompath_note_font", "ompath_notes_view", "ompath_notes_sort"];
const PREFIX = ["mcq_practice_", "exam_result_", "ompath_weak_"];
export const PERSONAL_PREFIXES = ["deck-", "deck:", "mcq_practice_", "exam_result_", "ompath_weak_", "progress:", "ompath_state_"];

const db = supabase as unknown as { from: (t: string) => any };
const isSynced = (k: string) => EXACT.includes(k) || PREFIX.some((p) => k.startsWith(p));
const keys = (): string[] => { try { return Object.keys(localStorage).filter(isSynced); } catch { return []; } };
const mt = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem("ompath_state_mt") || "{}"); } catch { return {}; } };
const setMt = (m: Record<string, number>) => { try { localStorage.setItem("ompath_state_mt", JSON.stringify(m)); } catch { /* blocked */ } };

/** Two copies of the same thing: counts take the larger number, lists join, anything else the newer one. */
function merge(key: string, local: unknown, remote: unknown, remoteNewer: boolean): unknown {
  if (key === "deck-daily" && local && remote && typeof local === "object" && typeof remote === "object") {
    const out: Record<string, number> = { ...(remote as Record<string, number>) };
    for (const [d, n] of Object.entries(local as Record<string, number>)) out[d] = Math.max(out[d] || 0, n);
    return out;
  }
  if ((key === "deck-stars" || key === "deck-buried") && Array.isArray(local) && Array.isArray(remote)) return [...new Set([...(remote as string[]), ...(local as string[])])];
  return remoteNewer ? remote : local;
}

let lastPushed: Record<string, string> = {};

async function push(userId: string) {
  const rows: { user_id: string; key: string; value: unknown; updated_at: string }[] = [];
  const times = mt();
  for (const k of keys()) {
    const raw = localStorage.getItem(k); if (raw == null || lastPushed[k] === raw) continue;
    let value: unknown; try { value = JSON.parse(raw); } catch { value = raw; }
    times[k] = Date.now();
    rows.push({ user_id: userId, key: k, value, updated_at: new Date(times[k]).toISOString() });
    lastPushed[k] = raw;
  }
  if (!rows.length) return;
  setMt(times);
  try { await db.from("user_state").upsert(rows.slice(0, 200), { onConflict: "user_id,key" }); } catch { /* try again next time */ }
}

/** Brings the account's copy into this browser, then keeps sending changes back. Returns a stop function. */
export function startAccountSync(userId: string): () => void {
  let stopped = false;
  try {
    // another person's data must not be here
    const last = localStorage.getItem("ompath_state_uid");
    if (last && last !== userId) { wipeLocalState(); }
    localStorage.setItem("ompath_state_uid", userId);
  } catch { /* blocked */ }
  void (async () => {
    try {
      const { data } = await db.from("user_state").select("key,value,updated_at").limit(1000);
      const times = mt();
      for (const r of (data || []) as { key: string; value: unknown; updated_at: string }[]) {
        if (!isSynced(r.key)) continue;
        const remoteAt = new Date(r.updated_at).getTime();
        const raw = localStorage.getItem(r.key);
        let local: unknown = undefined; if (raw != null) { try { local = JSON.parse(raw); } catch { local = raw; } }
        const next = local === undefined ? r.value : merge(r.key, local, r.value, remoteAt > (times[r.key] || 0));
        const str = typeof next === "string" ? next : JSON.stringify(next);
        if (str !== raw) { try { localStorage.setItem(r.key, str); } catch { /* blocked */ } }
        times[r.key] = Math.max(times[r.key] || 0, remoteAt); lastPushed[r.key] = str;
      }
      setMt(times);
      window.dispatchEvent(new Event("ompath:state-synced"));
    } catch { /* offline: local data still works */ }
    if (!stopped) void push(userId);
  })();
  const t = window.setInterval(() => void push(userId), 15_000);
  const hide = () => { if (document.visibilityState === "hidden") void push(userId); };
  document.addEventListener("visibilitychange", hide);
  return () => { stopped = true; window.clearInterval(t); document.removeEventListener("visibilitychange", hide); };
}

/** Removes the personal habits kept in this browser (used when a different person signs in, and on sign-out). */
export function wipeLocalState() {
  try {
    for (const k of Object.keys(localStorage)) if (PERSONAL_PREFIXES.some((p) => k.startsWith(p)) || isSynced(k)) localStorage.removeItem(k);
  } catch { /* blocked */ }
  lastPushed = {};
}
