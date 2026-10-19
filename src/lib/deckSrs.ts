// Spaced repetition for flashcard decks (an SM-2 style schedule, close to what Anki does). Four answers: Again, Hard, Good, Easy.
// A card you miss comes back within the session; a card you know comes back after longer and longer gaps (1 day, 3 days, about a week, a month...).
import { supabase } from "@/integrations/supabase/client";

export type Rating = "again" | "hard" | "good" | "easy";
export interface CardState { ef: number; iv: number; reps: number; lapses: number; due: number }

const MIN = 60_000, DAY = 86_400_000;
export const NEW_STATE: CardState = { ef: 2.5, iv: 0, reps: 0, lapses: 0, due: 0 };

/** The next state of a card after an answer. `iv` is in days; a card still being learned has iv 0 and is due in minutes. */
export function schedule(s: CardState | undefined, rating: Rating, now = Date.now()): CardState {
  const c = { ...(s ?? NEW_STATE) };
  const learning = c.reps === 0;
  if (rating === "again") return { ef: Math.max(1.3, c.ef - 0.2), iv: 0, reps: 0, lapses: c.lapses + 1, due: now + MIN };
  if (rating === "hard") {
    if (learning) return { ...c, iv: 0, due: now + 10 * MIN };
    const iv = Math.max(1, Math.round(c.iv * 1.2));
    return { ef: Math.max(1.3, c.ef - 0.15), iv, reps: c.reps + 1, lapses: c.lapses, due: now + iv * DAY };
  }
  if (rating === "good") {
    const iv = c.reps === 0 ? 1 : c.reps === 1 ? 3 : Math.max(c.iv + 1, Math.round(c.iv * c.ef));
    return { ef: c.ef, iv, reps: c.reps + 1, lapses: c.lapses, due: now + iv * DAY };
  }
  const iv = c.reps === 0 ? 4 : Math.max(c.iv + 2, Math.round(c.iv * c.ef * 1.3));
  return { ef: Math.min(3, c.ef + 0.15), iv, reps: c.reps + 1, lapses: c.lapses, due: now + iv * DAY };
}

/** "<1m", "10m", "1d", "3d", "2 wk", "1 mo": what each button will do, shown on the button. */
export function label(s: CardState | undefined, rating: Rating, now = Date.now()): string {
  const gap = schedule(s, rating, now).due - now;
  if (gap < 5 * MIN) return "<1m";
  if (gap < 2 * 60 * MIN) return `${Math.round(gap / MIN)}m`;
  const d = Math.round(gap / DAY);
  if (d < 14) return `${d}d`;
  if (d < 60) return `${Math.round(d / 7)} wk`;
  return `${Math.round(d / 30)} mo`;
}

/** In a session a missed card comes back after a few more cards, a hard first-time one after more; 0 means it is finished for now. */
export function requeueGap(rating: Rating, next: CardState): number {
  if (rating === "again") return 3;
  if (rating === "hard" && next.reps === 0) return 7;
  return 0;
}

export const isDue = (s: CardState | undefined, now = Date.now()) => !!s && s.due <= now;

// ---- storage: this device first, the account too when signed in ----
const LKEY = "deck-srs:";
export const cardKey = (setId: string, idx: number) => `${setId}:${idx}`;
const readLocal = (): Record<string, CardState> => { try { return JSON.parse(localStorage.getItem(LKEY) || "{}"); } catch { return {}; } };
const writeLocal = (m: Record<string, CardState>) => { try { localStorage.setItem(LKEY, JSON.stringify(m)); } catch { /* storage blocked */ } };
const db = supabase as unknown as { from: (t: string) => any };

export async function saveState(userId: string | null, setId: string, idx: number, s: CardState) {
  const m = readLocal(); m[cardKey(setId, idx)] = s; writeLocal(m);
  if (!userId) return;
  try { await db.from("flashcard_reviews").upsert({ user_id: userId, set_id: setId, card_idx: idx, ef: s.ef, iv: s.iv, reps: s.reps, lapses: s.lapses, due: new Date(s.due).toISOString(), updated_at: new Date().toISOString() }, { onConflict: "user_id,set_id,card_idx" }); } catch { /* the local copy still has it */ }
}

/** Every card state the account has, merged over this device's (the one with more reviews wins). */
export async function loadStates(userId: string | null): Promise<Record<string, CardState>> {
  const m = readLocal();
  if (!userId) return m;
  try {
    const { data } = await db.from("flashcard_reviews").select("set_id,card_idx,ef,iv,reps,lapses,due").eq("user_id", userId).limit(5000);
    for (const r of (data || []) as { set_id: string; card_idx: number; ef: number; iv: number; reps: number; lapses: number; due: string }[]) {
      const k = cardKey(r.set_id, r.card_idx);
      const remote: CardState = { ef: r.ef, iv: r.iv, reps: r.reps, lapses: r.lapses, due: Date.parse(r.due) };
      if (!m[k] || remote.reps >= m[k].reps) m[k] = remote;
    }
    writeLocal(m);
  } catch { /* local only */ }
  return m;
}
