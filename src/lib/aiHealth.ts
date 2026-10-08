// When Ompath AI fails for a student, the student still gets a fallback answer; the failure is also written here so the admin
// (the account with the admin role, hydrocephcare@gmail.com) can see it. Needs supabase/migrations/20261009120000_ompath_ai_failures.sql;
// without that table every call below quietly does nothing.
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type AiFailureKind = "answer" | "search" | "quiz" | "essay" | "paper" | "drill" | "other";
export interface AiFailure { id: string; kind: AiFailureKind; question: string | null; message: string | null; fallback: string | null; page: string | null; created_at: string }

const SENT = "ompath_ai_fail_sent";
const SEEN = "ompath_ai_fail_seen";

/** Records one failure. The same failure is not sent twice within ten minutes from one device. */
export async function reportAiFailure(kind: AiFailureKind, question: string, error: unknown, fallback: string) {
  try {
    const message = (error instanceof Error ? error.message : String(error ?? "")).slice(0, 300);
    const key = `${kind}|${message.slice(0, 60)}`;
    const sent = JSON.parse(sessionStorage.getItem(SENT) ?? "{}") as Record<string, number>;
    if (sent[key] && Date.now() - sent[key] < 10 * 60_000) return;
    sessionStorage.setItem(SENT, JSON.stringify({ ...sent, [key]: Date.now() }));
    await db.from("ai_failures").insert({ kind, question: question.slice(0, 300), message, fallback: fallback.slice(0, 80), page: typeof location !== "undefined" ? location.pathname.slice(0, 120) : null });
  } catch { /* the table is not set up, or the device is offline: never bother the student */ }
}

export async function loadAiFailures(limit = 100): Promise<AiFailure[]> {
  try {
    const { data, error } = await db.from("ai_failures").select("*").order("created_at", { ascending: false }).limit(limit);
    return error || !Array.isArray(data) ? [] : (data as AiFailure[]);
  } catch { return []; }
}

export async function clearAiFailures(): Promise<boolean> {
  try { const { error } = await db.from("ai_failures").delete().not("id", "is", null); return !error; } catch { return false; }
}

/** How many failures happened since the admin last looked (or in the last day, the first time). */
export async function newAiFailureCount(): Promise<number> {
  try {
    const since = localStorage.getItem(SEEN) ?? new Date(Date.now() - 86_400_000).toISOString();
    const { count, error } = await db.from("ai_failures").select("id", { count: "exact", head: true }).gt("created_at", since);
    return error ? 0 : count ?? 0;
  } catch { return 0; }
}

export const markAiFailuresSeen = () => { try { localStorage.setItem(SEEN, new Date().toISOString()); } catch { /* storage blocked */ } };
