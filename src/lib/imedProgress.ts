// Which IMED topics a student has finished: ticked by hand, or automatically once they have read the note for a couple of active minutes
// (see readLog). Kept per account on this device.
import { allReads } from "@/lib/readLog";
import { IMED, type ImedTopic } from "@/data/imed";

const keyFor = (uid: string | null | undefined) => `ompath_imed_done_${uid ?? "guest"}`;
const manual = (uid: string | null | undefined): string[] => { try { const v = JSON.parse(localStorage.getItem(keyFor(uid)) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };

export function doneTopics(uid: string | null | undefined): Set<string> {
  const done = new Set(manual(uid));
  const paths = new Set(allReads(uid).map((r) => r.p));
  for (const s of IMED) for (const t of s.topics) if (t.note && paths.has(`/notes/${t.note}`)) done.add(t.id);
  return done;
}
export function toggleTopic(uid: string | null | undefined, id: string) {
  const m = new Set(manual(uid));
  if (m.has(id)) m.delete(id); else m.add(id);
  try { localStorage.setItem(keyFor(uid), JSON.stringify([...m])); } catch { /* storage blocked */ }
}
export const systemProgress = (uid: string | null | undefined, topics: ImedTopic[]) => { const d = doneTopics(uid); return { done: topics.filter((t) => d.has(t.id)).length, total: topics.length }; };
