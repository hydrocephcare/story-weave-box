// Keeps a signed-in student's note progress (how far they got, finished, review dates) in their account, so it follows them between phone and laptop.
// The device always works without it: if the table is missing or the student is signed out, everything stays local. Rows are the student's own (row-level security).
import { supabase } from "@/integrations/supabase/client";
import { savePlace } from "@/lib/noteProgress";

type Db = { from: (t: string) => any };
const db = () => supabase as unknown as Db;
const finishedKey = (uid: string) => `ompath_note_done_${uid}`;

let pulled = "";
/** Once per sign-in: bring the account's progress onto this device (finished is kept if either side has it; progress keeps the larger value). */
export async function pullProgress(uid: string | null | undefined) {
  if (!uid || pulled === uid) return;
  pulled = uid;
  try {
    const { data, error } = await db().from("note_progress").select("note_slug,progress,finished,updated_at").eq("user_id", uid).limit(500);
    if (error || !Array.isArray(data)) return;
    const done = new Set<string>(JSON.parse(localStorage.getItem(finishedKey(uid)) ?? "[]"));
    for (const r of data as { note_slug: string; progress: number; finished: boolean }[]) {
      if (r.finished) done.add(r.note_slug);
      else if (r.progress >= 5 && r.progress < 92) savePlace(uid, { slug: r.note_slug, title: r.note_slug.replace(/-/g, " "), progress: r.progress });
    }
    localStorage.setItem(finishedKey(uid), JSON.stringify([...done]));
  } catch { /* offline or not set up */ }
}

const timers = new Map<string, number>();
/** Saves one note's progress to the account a moment after it stops changing. */
export function pushProgress(uid: string | null | undefined, slug: string, p: { progress: number; finished: boolean }) {
  if (!uid) return;
  window.clearTimeout(timers.get(slug));
  timers.set(slug, window.setTimeout(() => {
    void db().from("note_progress").upsert({ user_id: uid, note_slug: slug, progress: Math.max(0, Math.min(100, Math.round(p.progress))), finished: p.finished, updated_at: new Date().toISOString() }, { onConflict: "user_id,note_slug" });
  }, 1500));
}
