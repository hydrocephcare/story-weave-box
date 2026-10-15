import { supabase } from "@/integrations/supabase/client";
import {
  configureContestRound, createContest, createContestRound, importExamPaperToContestRound, loadAdminContests, loadAdminExamPapers, loadAllContestUniversities,
  setContestUniversityScope, updateContestStage, type AdminExamPaper, type ContestUniversity,
} from "@/lib/contest-store";
import type { ContestStage } from "@/lib/contest";

export interface AgentAction { tool: "create_contest" | "delete_contest" | "set_stage" | "go_to" | "set_autopilot_mode" | "run_autopilot"; args: Record<string, any> }
export interface AgentContext { page?: string; problems?: { at: string; what: string }[]; now: string; universities: { slug: string; name: string }[]; exams: string[]; contests: { slug: string; title: string; stage: string }[] }
export interface PlanItem { action: AgentAction; line: string; danger: boolean; ok: boolean }

const nairobiNow = () => new Intl.DateTimeFormat("en-KE", { dateStyle: "full", timeStyle: "short", timeZone: "Africa/Nairobi" }).format(new Date());
const toDate = (local: string) => new Date(`${local}:00+03:00`);

export interface AgentWorld { universities: (ContestUniversity & { active: boolean })[]; papers: AdminExamPaper[]; contests: Awaited<ReturnType<typeof loadAdminContests>> }

export async function loadAgentWorld(): Promise<AgentWorld> {
  const [universities, papers, contests] = await Promise.all([loadAllContestUniversities(), loadAdminExamPapers(), loadAdminContests()]);
  return { universities: universities.filter((u) => u.active), papers, contests };
}

export function agentContext(w: AgentWorld): AgentContext {
  return { now: nairobiNow(), universities: w.universities.map((u) => ({ slug: u.slug, name: u.name })), exams: w.papers.map((p) => p.title), contests: w.contests.map((c) => ({ slug: c.slug, title: c.title, stage: c.stage })) };
}

/** Closest exam to the words the assistant gave: most shared words, ties go to the shorter title. */
export function pickExam(papers: AdminExamPaper[], words: string): AdminExamPaper | null {
  const want = words.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  if (!want.length) return null;
  let best: AdminExamPaper | null = null, score = 0;
  for (const p of papers) {
    const t = p.title.toLowerCase();
    const s = want.filter((w) => t.includes(w)).length;
    if (s > score || (s === score && best && s > 0 && p.title.length < best.title.length)) { best = p; score = s; }
  }
  return score >= Math.min(2, want.length) ? best : null;
}

/** Turns each planned action into a plain sentence for the confirm card, and says whether it can run. */
export function describe(actions: AgentAction[], w: AgentWorld): PlanItem[] {
  return actions.map((action) => {
    const a = action.args || {};
    if (action.tool === "create_contest") {
      const all = a.universities === "all";
      const slugs: string[] = Array.isArray(a.universities) ? a.universities : [];
      const unis = slugs.map((s) => w.universities.find((u) => u.slug === s)).filter(Boolean) as ContestUniversity[];
      const exam = a.exam ? pickExam(w.papers, String(a.exam)) : null;
      const start = a.start && !Number.isNaN(toDate(String(a.start)).getTime()) ? toDate(String(a.start)) : null;
      const problems = [!String(a.title || "").trim() && "no title", !all && unis.length < 2 && "needs at least 2 universities", !exam && "no matching exam found", !start && "no valid start time"].filter(Boolean);
      const when = start ? new Intl.DateTimeFormat("en-KE", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "Africa/Nairobi" }).format(start) : "?";
      return { action, danger: false, ok: problems.length === 0, line: `Create contest "${a.title}" for ${all ? "all universities" : unis.map((u) => u.abbreviation || u.name).join(" + ")}, Year ${(a.years || [1, 2, 3]).join(", ")}, questions from "${exam?.title ?? "?"}", starting ${when} (EAT) for ${a.minutes || 30} minutes. Registration opens straight away${problems.length ? ` — cannot run: ${problems.join(", ")}` : ""}.` };
    }
    if (action.tool === "delete_contest") {
      const c = w.contests.find((x) => x.slug === a.slug);
      return { action, danger: true, ok: Boolean(c), line: c ? `DELETE the contest "${c.title}" (${c.stage}) permanently, with its registrations and results.` : `Delete contest "${a.slug}" — not found, cannot run.` };
    }
    if (action.tool === "go_to") return { action, danger: false, ok: /^\/admin(\/[a-z0-9-]+)*$/.test(String(a.path)), line: `Open ${a.path}.` };
    if (action.tool === "set_autopilot_mode") return { action, danger: false, ok: ["approve_access", "daily_digest"].includes(a.key) && ["off", "ask", "auto"].includes(a.mode), line: `Set Autopilot job "${a.key}" to ${a.mode}${a.mode === "auto" ? " (it will act on its own, with an Undo in the log)" : ""}.` };
    if (action.tool === "run_autopilot") return { action, danger: false, ok: true, line: "Run the Autopilot jobs now." };
    const c = w.contests.find((x) => x.slug === a.slug);
    const okStage = ["concept", "registration", "live", "completed"].includes(a.stage);
    return { action, danger: false, ok: Boolean(c) && okStage, line: c && okStage ? `Move "${c.title}" from ${c.stage} to ${a.stage}.` : `Change stage of "${a.slug}" — not found or invalid stage, cannot run.` };
  });
}

/** Runs one confirmed action with the administrator's own login. Returns a sentence saying what happened. */
export async function runAction(action: AgentAction, w: AgentWorld): Promise<string> {
  const a = action.args || {};
  if (action.tool === "set_autopilot_mode") { const { error } = await (supabase as any).rpc("admin_agent_set_mode", { p_key: a.key, p_mode: a.mode }); if (error) throw new Error(/schema cache|admin_agent_set_mode/.test(error.message) ? "Run autopilot.sql first." : error.message); return `Autopilot job ${a.key} is now ${a.mode}.`; }
  if (action.tool === "run_autopilot") { const { data, error } = await (supabase as any).rpc("admin_agent_run"); if (error) throw new Error(/schema cache|admin_agent_run/.test(error.message) ? "Run autopilot.sql first." : error.message); return `Autopilot ran: ${data?.approved ?? 0} approved, ${data?.queued ?? 0} waiting for you.`; }
  if (action.tool === "go_to") return `Opened ${a.path}.`;
  if (action.tool === "delete_contest") {
    const { error } = await (supabase as any).rpc("admin_delete_contest", { p_slug: String(a.slug) });
    if (error) throw new Error(/admin_delete_contest|schema cache/.test(error.message) ? "Run contest-admin-tools.sql first." : error.message);
    return `Deleted "${a.slug}".`;
  }
  if (action.tool === "set_stage") {
    const c = w.contests.find((x) => x.slug === a.slug); if (!c) throw new Error("Contest not found.");
    await updateContestStage(c.id, a.stage as ContestStage);
    return `"${c.title}" is now ${a.stage}.`;
  }
  const all = a.universities === "all";
  const ids = all ? [] : (a.universities as string[]).map((s) => w.universities.find((u) => u.slug === s)?.id).filter(Boolean) as string[];
  const exam = pickExam(w.papers, String(a.exam || "")); if (!exam) throw new Error("No matching exam.");
  const minutes = Math.max(5, Math.min(240, Number(a.minutes) || 30));
  const startsAt = toDate(String(a.start)).toISOString(), endsAt = new Date(toDate(String(a.start)).getTime() + minutes * 60_000).toISOString();
  const years = (Array.isArray(a.years) && a.years.length ? a.years : [1, 2, 3]).map(Number).filter((y: number) => y >= 1 && y <= 6);
  const created = await createContest({ title: String(a.title).trim(), subtitle: "", subjects: [], years, format: "One round", registrationOpensAt: new Date().toISOString(), registrationClosesAt: startsAt, startsAt, shareImageUrl: null, published: true });
  await setContestUniversityScope(created.id, ids, a.autoAdmit !== false);
  const round = await createContestRound(created.id, "Round 1", minutes * 60);
  await importExamPaperToContestRound(round.id, exam.id);
  await configureContestRound({ roundId: round.id, status: "scheduled", startsAt, endsAt, durationSeconds: minutes * 60, tabSwitchLimit: 3, focusLossLimit: 3, autoEliminate: true });
  await updateContestStage(created.id, "registration");
  return `Created "${a.title}": https://www.ompathstudy.com/contests/${created.slug}`;
}

export async function askAgent(message: string, history: { role: "user" | "assistant"; content: string }[], context: AgentContext): Promise<{ reply: string; actions: AgentAction[] }> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error("Log in as an administrator first.");
  const r = await fetch("/api/ai?task=agent", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ message, history, context }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "The assistant could not answer.");
  return { reply: String(j.reply || ""), actions: Array.isArray(j.actions) ? j.actions : [] };
}
