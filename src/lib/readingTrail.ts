// "Where was I?": one reading trail that follows the account. Notes you open are remembered on this device straight away and, when signed in, in the account
// (table user_resource_progress), so the phone and the laptop show the same "continue reading", the same ticks and the same progress.
import { supabase } from "@/integrations/supabase/client";
import { getRecentArticles, markArticleVisited, type RecentArticle } from "@/lib/progress-store";

const db = supabase as unknown as { from: (t: string) => any };
const POS_KEY = "progress:positions";   // note id -> { at: 0..1, t: ms, sec: seconds really spent reading, done: read properly }

export interface TrailItem {
  id: string;
  title: string;
  category: string;
  slug: string | null;
  openedAt: number;
  /** How far down the note the reader got, 0..1. */
  at: number;
  done: boolean;
}

type Pos = { at: number; t: number; sec?: number; done?: boolean };
function readPositions(): Record<string, Pos> {
  try { return JSON.parse(localStorage.getItem(POS_KEY) || "{}"); } catch { return {}; }
}
function writePositions(p: Record<string, Pos>) {
  try {
    const keep = Object.entries(p).sort((a, b) => b[1].t - a[1].t).slice(0, 200);
    localStorage.setItem(POS_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch { /* quota */ }
}

/** A note was opened: remember it here and, when signed in, in the account. Does not touch a status the reader already set. */
export async function trackNoteOpen(userId: string | null, a: { id: string; title: string; category: string }) {
  markArticleVisited({ id: a.id, title: a.title, category: a.category, visitedAt: Date.now() });
  if (!userId) return;
  try {
    await db.from("user_resource_progress").upsert(
      { user_id: userId, resource_type: "article", resource_id: a.id, last_opened_at: new Date().toISOString() },
      { onConflict: "user_id,resource_type,resource_id" },
    );
  } catch { /* offline: the local copy still has it */ }
}

/**
 * Saves how far down a note the reader is and how long they really spent on it. A note counts as READ only when they got to the end AND spent
 * a fair share of the time it takes to read (scrolling past in a few seconds does not count). Returns true the first time a note becomes read.
 */
export async function saveNotePosition(userId: string | null, id: string, at: number, sec = 0, needSec = 0): Promise<boolean> {
  const f = Math.max(0, Math.min(1, at));
  const p = readPositions();
  const before = p[id];
  const seconds = Math.max(sec, before?.sec ?? 0);
  const done = !!before?.done || (f >= 0.9 && seconds >= needSec);
  const becameRead = done && !before?.done;
  p[id] = { at: Math.max(f, before?.at ?? 0), t: Date.now(), sec: seconds, done };
  writePositions(p);
  if (!userId) return becameRead;
  const patch: Record<string, unknown> = { user_id: userId, resource_type: "article", resource_id: id, last_opened_at: new Date().toISOString(), progress_percent: Math.round(p[id].at * 100), last_position: String(Math.round(f * 1000) / 1000) };
  try {
    if (done) {
      // reading properly counts as studied, unless the reader marked it "difficult" or "revisit" themselves
      const { data: cur } = await db.from("user_resource_progress").select("status").eq("user_id", userId).eq("resource_type", "article").eq("resource_id", id).maybeSingle();
      if (!cur?.status || cur.status === "in_progress" || cur.status === "not_started") { patch.status = "completed"; patch.completed_at = new Date().toISOString(); }
    }
    await db.from("user_resource_progress").upsert(patch, { onConflict: "user_id,resource_type,resource_id" });
  } catch { /* ignore */ }
  return becameRead;
}

export function localPosition(id: string): number {
  return readPositions()[id]?.at ?? 0;
}

/** The reader's trail, newest first: the account's history merged with what this device remembers. */
export async function loadTrail(userId: string | null, limit = 12): Promise<TrailItem[]> {
  const items = new Map<string, TrailItem>();
  const local = getRecentArticles();
  const pos = readPositions();
  for (const r of local as RecentArticle[]) items.set(r.id, { id: r.id, title: r.title, category: r.category, slug: null, openedAt: r.visitedAt, at: pos[r.id]?.at ?? 0, done: !!pos[r.id]?.done });
  if (userId) {
    try {
      const { data } = await db.from("user_resource_progress").select("resource_id, status, progress_percent, last_opened_at").eq("user_id", userId).eq("resource_type", "article").order("last_opened_at", { ascending: false }).limit(60);
      const rows = (data || []) as { resource_id: string; status: string; progress_percent: number | null; last_opened_at: string }[];
      for (const r of rows) {
        const prev = items.get(r.resource_id);
        const opened = Date.parse(r.last_opened_at) || 0;
        const at = Math.max(prev?.at ?? 0, (r.progress_percent ?? 0) / 100);
        items.set(r.resource_id, { id: r.resource_id, title: prev?.title ?? "", category: prev?.category ?? "", slug: prev?.slug ?? null, openedAt: Math.max(prev?.openedAt ?? 0, opened), at, done: r.status === "completed" || !!prev?.done });
      }
    } catch { /* fall back to the local trail */ }
  }
  const ids = [...items.values()].filter((i) => !i.title).map((i) => i.id);
  const need = [...items.keys()].slice(0, 80);
  if (ids.length || need.length) {
    try {
      const { data } = await db.from("articles").select("id, title, slug, category").in("id", need.length ? need : ids).eq("published", true);
      for (const a of (data || []) as { id: string; title: string; slug: string | null; category: string }[]) {
        const it = items.get(a.id);
        if (it) { it.title = a.title; it.slug = a.slug; it.category = a.category; }
      }
    } catch { /* titles stay as they were */ }
  }
  return [...items.values()].filter((i) => i.title).sort((a, b) => b.openedAt - a.openedAt).slice(0, limit);
}

/** The ids of every note the account has finished or mostly read, for ticks and unit progress. */
export async function loadReadIds(userId: string | null): Promise<Set<string>> {
  const out = new Set<string>();
  for (const [id, p] of Object.entries(readPositions())) if (p.done) out.add(id);
  if (userId) {
    try {
      const { data } = await db.from("user_resource_progress").select("resource_id, status, progress_percent").eq("user_id", userId).eq("resource_type", "article").limit(2000);
      for (const r of (data || []) as { resource_id: string; status: string; progress_percent: number | null }[]) if (r.status === "completed") out.add(r.resource_id);
    } catch { /* local only */ }
  }
  return out;
}

/** After signing in: push what this device remembers into the account, so nothing read as a guest is lost. */
export async function syncTrailToAccount(userId: string) {
  const local = getRecentArticles();
  const pos = readPositions();
  if (!local.length) return;
  try {
    await db.from("user_resource_progress").upsert(
      local.map((r) => ({ user_id: userId, resource_type: "article", resource_id: r.id, last_opened_at: new Date(r.visitedAt).toISOString(), ...(pos[r.id] ? { progress_percent: Math.round(pos[r.id].at * 100), last_position: String(pos[r.id].at) } : {}) })),
      { onConflict: "user_id,resource_type,resource_id", ignoreDuplicates: true },
    );
  } catch { /* try again at the next sign-in */ }
}
