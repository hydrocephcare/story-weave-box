// Ompath AI conversations: kept in this browser so a student can leave, browse a note, and come back to the same chat.
// Each conversation has a title (its first question), its turns and when it was last used.
import { useSyncExternalStore } from "react";
import type { SiteHit } from "@/lib/siteSearch";

export interface AiTurn {
  id: string;
  q: string;
  answer: string;
  hits: SiteHit[];
  grounded: boolean;
  error?: string;
  at: number;
  /** "up" / "down" the student gave the answer. */
  vote?: "up" | "down";
  followUps?: string[];
  /** Answered without the AI: "quick" for small talk, "saved" for a question asked before. */
  instant?: "quick" | "saved";
}
export interface AiSession { id: string; title: string; turns: AiTurn[]; updated: number }

const KEY = "ompath_ai_sessions_v2";
const ACTIVE = "ompath_ai_active";
const MAX_SESSIONS = 40;
const MAX_TURNS = 30;

function read(): AiSession[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

let sessions: AiSession[] = typeof window === "undefined" ? [] : read();
let activeId: string | null = typeof window === "undefined" ? null : (() => { try { return localStorage.getItem(ACTIVE); } catch { return null; } })();
const listeners = new Set<() => void>();
const emit = () => { listeners.forEach((l) => l()); };

function persist() {
  try {
    // keep the stored copy small: only the best 12 hits of each turn
    const slim = sessions.slice(0, MAX_SESSIONS).map((s) => ({ ...s, turns: s.turns.slice(-MAX_TURNS).map((t) => ({ ...t, hits: t.hits.slice(0, 12) })) }));
    localStorage.setItem(KEY, JSON.stringify(slim));
    if (activeId) localStorage.setItem(ACTIVE, activeId); else localStorage.removeItem(ACTIVE);
  } catch { /* storage full or blocked */ }
}

const snapshot = () => ({ sessions, activeId });
let snap = snapshot();
const refresh = () => { snap = snapshot(); persist(); emit(); };

export const aiStore = {
  get: () => snap,
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  newSession(): string {
    const id = `s${Date.now()}`;
    sessions = [{ id, title: "New chat", turns: [], updated: Date.now() }, ...sessions.filter((s) => s.turns.length || s.id === activeId)];
    activeId = id; refresh();
    return id;
  },
  open(id: string) { if (sessions.some((s) => s.id === id)) { activeId = id; refresh(); } },
  remove(id: string) { sessions = sessions.filter((s) => s.id !== id); if (activeId === id) activeId = sessions[0]?.id ?? null; refresh(); },
  clearAll() { sessions = []; activeId = null; refresh(); },
  addTurn(sessionId: string, turn: AiTurn) {
    sessions = sessions.map((s) => s.id === sessionId ? { ...s, title: s.turns.length ? s.title : turn.q.slice(0, 60), turns: [...s.turns, turn], updated: Date.now() } : s);
    sessions.sort((a, b) => b.updated - a.updated);
    refresh();
  },
  patchTurn(sessionId: string, turnId: string, patch: Partial<AiTurn>) {
    sessions = sessions.map((s) => s.id === sessionId ? { ...s, turns: s.turns.map((t) => t.id === turnId ? { ...t, ...patch } : t) } : s);
    // streaming updates are frequent: update memory and listeners, write to storage only when the turn is complete
    snap = snapshot(); emit();
    if (patch.error !== undefined || patch.followUps || patch.vote) persist();
  },
  flush() { persist(); },
};

export function useAiStore() {
  return useSyncExternalStore(aiStore.subscribe, aiStore.get, aiStore.get);
}
