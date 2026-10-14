// What the AI knows about this student, kept on their device and account: what they asked this week, what they really read, and what they found unclear.
// Used to shape answers (depth, links between topics, what to revisit). Nothing here leaves the browser except as one short sentence in the question.
import { aiStore } from "@/lib/ompathAiStore";
import { readsThisWeek } from "@/lib/readLog";

const clip = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function learnerNote(userId: string | null | undefined, current: string): string {
  try {
    const since = Date.now() - 7 * 86_400_000;
    const turns = aiStore.get().sessions.flatMap((s) => s.turns).filter((t) => t.at > since && t.q.trim().toLowerCase() !== current.trim().toLowerCase());
    const asked = [...new Set(turns.map((t) => clip(t.q.replace(/\s+/g, " ").trim())).filter((q) => q.length > 5))].slice(-4);
    const unclear = [...new Set(turns.filter((t) => t.vote === "down").map((t) => clip(t.q.replace(/\s+/g, " ").trim())))].slice(-2);
    const read = readsThisWeek(userId).slice(0, 3).map((r) => clip(r.t));
    const bits: string[] = [];
    if (asked.length) bits.push(`recently asked: ${asked.join("; ")}`);
    if (read.length) bits.push(`has read: ${read.join("; ")}`);
    if (unclear.length) bits.push(`found these unclear: ${unclear.join("; ")} (explain more simply)`);
    return bits.length ? `About this student: ${bits.join(". ")}. Link to these when it helps.` : "";
  } catch { return ""; }
}
