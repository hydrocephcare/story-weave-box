import { supabase } from "@/integrations/supabase/client";
import {
  configureContestRound, createContest, createContestRound, importExamPaperToContestRound, loadAdminContests, loadAdminExamPapers, loadAllContestUniversities,
  setContestUniversityScope, updateContestStage, updateContestDetails, loadAdminContestRegistrations, type AdminExamPaper, type ContestUniversity,
} from "@/lib/contest-store";
import type { ContestStage } from "@/lib/contest";

export interface AgentAction { tool: "create_contest" | "delete_contest" | "set_stage" | "go_to" | "set_autopilot_mode" | "run_autopilot" | "seo_scan" | "seo_fix" | "site_stats" | "contest_report"; args: Record<string, any> }
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
    if (action.tool === "seo_fix") return { action, danger: false, ok: true, line: `Rewrite up to ${Math.min(15, Number(a.limit) || 10)} weak search descriptions with AI. The old text is kept so you can undo it.` };
    const c = w.contests.find((x) => x.slug === a.slug);
    const okStage = ["concept", "registration", "live", "completed"].includes(a.stage);
    return { action, danger: false, ok: Boolean(c) && okStage, line: c && okStage ? `Move "${c.title}" from ${c.stage} to ${a.stage}.` : `Change stage of "${a.slug}" — not found or invalid stage, cannot run.` };
  });
}

export interface ActionLink { label: string; href: string; external?: boolean }
/** What happened, plus where to go next. `partial` means it got part of the way and the links continue from there; `undo` is the action that reverses it. */
export interface ActionResult { text: string; links?: ActionLink[]; undo?: AgentAction; partial?: boolean }
const SITE = "https://www.ompathstudy.com";
const wa = (t: string) => `https://wa.me/?text=${encodeURIComponent(t)}`;

/** Runs one confirmed action with the administrator's own login. If it stops half way it says where, and gives a link to carry on from there. */
export async function runAction(action: AgentAction, w: AgentWorld): Promise<ActionResult> {
  const a = action.args || {};
  if (action.tool === "set_autopilot_mode") { const { error } = await (supabase as any).rpc("admin_agent_set_mode", { p_key: a.key, p_mode: a.mode }); if (error) throw new Error(/schema cache|admin_agent_set_mode/.test(error.message) ? "Run autopilot.sql first." : error.message); return { text: `Autopilot job ${a.key} is now ${a.mode}.`, links: [{ label: "Open Autopilot", href: "/admin/autopilot" }] }; }
  if (action.tool === "run_autopilot") { const { data, error } = await (supabase as any).rpc("admin_agent_run"); if (error) throw new Error(/schema cache|admin_agent_run/.test(error.message) ? "Run autopilot.sql first." : error.message); return { text: `Autopilot ran: ${data?.approved ?? 0} approved, ${data?.queued ?? 0} waiting for you.`, links: [{ label: "See the log", href: "/admin/autopilot" }] }; }
  if (action.tool === "go_to") return { text: `Opened ${a.path}.` };
  if (action.tool === "seo_fix") return runSeoFix(Number(a.limit) || 10);
  if (action.tool === "delete_contest") {
    const { error } = await (supabase as any).rpc("admin_delete_contest", { p_slug: String(a.slug) });
    if (error) throw new Error(/admin_delete_contest|schema cache/.test(error.message) ? "Delete needs one database file: run contest-admin-tools.sql in the Lovable SQL editor, then ask me again. Until then you can delete it in Advanced setup." : error.message);
    return { text: `Deleted "${a.slug}".`, links: [{ label: "Contest list", href: "/admin/contests" }] };
  }
  if (action.tool === "set_stage") {
    const c = w.contests.find((x) => x.slug === a.slug); if (!c) throw new Error("Contest not found.");
    await updateContestStage(c.id, a.stage as ContestStage);
    return { text: `"${c.title}" is now ${a.stage}.`, links: [{ label: "Open the contest", href: `/contests/${c.slug}` }] };
  }
  if (action.tool !== "create_contest") throw new Error("I do not know how to do that.");
  const all = a.universities === "all";
  const ids = all ? [] : (a.universities as string[]).map((s) => w.universities.find((u) => u.slug === s)?.id).filter(Boolean) as string[];
  const exam = pickExam(w.papers, String(a.exam || "")); if (!exam) throw new Error("No matching exam.");
  const minutes = Math.max(5, Math.min(240, Number(a.minutes) || 30));
  const startsAt = toDate(String(a.start)).toISOString(), endsAt = new Date(toDate(String(a.start)).getTime() + minutes * 60_000).toISOString();
  const years = (Array.isArray(a.years) && a.years.length ? a.years : [1, 2, 3]).map(Number).filter((y: number) => y >= 1 && y <= 6);
  let at = "creating the contest", created: { id: string; slug: string } | null = null;
  try {
    created = await createContest({ title: String(a.title).trim(), subtitle: "", subjects: [], years, format: "One round", registrationOpensAt: new Date().toISOString(), registrationClosesAt: startsAt, startsAt, shareImageUrl: null, published: false });
    at = "setting who can enter"; await setContestUniversityScope(created.id, ids, a.autoAdmit !== false);
    at = "adding the round"; const round = await createContestRound(created.id, "Round 1", minutes * 60);
    at = "adding the questions"; await importExamPaperToContestRound(round.id, exam.id);
    at = "setting the time"; await configureContestRound({ roundId: round.id, status: "scheduled", startsAt, endsAt, durationSeconds: minutes * 60, tabSwitchLimit: 3, focusLossLimit: 3, autoEliminate: true });
    at = "publishing"; await updateContestDetails(created.id, { title: String(a.title).trim(), subtitle: "", subjects: [], years, format: "One round", registrationOpensAt: new Date().toISOString(), registrationClosesAt: startsAt, startsAt, shareImageUrl: null, published: true });
    at = "opening registration"; await updateContestStage(created.id, "registration");
  } catch (e: any) {
    if (!created) throw e;
    // it got part of the way: keep what exists (hidden from students until it is finished) and say exactly where to carry on
    return {
      partial: true,
      text: `I created "${a.title}" but stopped while ${at}: ${e?.message || "an error"}. It is saved as a draft that students cannot see yet. Carry on from here:`,
      links: [{ label: "Finish it in contest setup", href: `/admin/contests/setup?contest=${created.id}` }, { label: "Preview the page", href: `/contests/${created.slug}` }],
      undo: { tool: "delete_contest", args: { slug: created.slug } },
    };
  }
  const url = `${SITE}/contests/${created.slug}`;
  return {
    text: `Created "${a.title}" and opened registration. Students can register now.`,
    links: [{ label: "Open the contest page", href: `/contests/${created.slug}` }, { label: "Contest settings", href: `/admin/contests/setup?contest=${created.id}` }, { label: "Share on WhatsApp", href: wa(`${a.title} on Ompath Study. Represent your university: ${url}`), external: true }],
    undo: { tool: "delete_contest", args: { slug: created.slug } },
  };
}

// ---- search-engine (SEO) checks on the published posts: read-only scan, and a fixer that keeps the old text so it can be undone
const PLACEHOLDER = /awaiting edit|source paper|private source/i;
interface PostRow { id: string; slug: string | null; title: string | null; meta_title: string | null; meta_description: string | null; content?: string | null }

async function loadPosts(withContent = false): Promise<PostRow[]> {
  const out: PostRow[] = [];
  for (let from = 0; from < 3000; from += 500) {
    const { data, error } = await (supabase as any).from("articles").select(`id,slug,title,meta_title,meta_description${withContent ? ",content" : ""}`).eq("published", true).is("deleted_at", null).order("created_at").range(from, from + 499);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  return out;
}

export async function runSeoScan(): Promise<ActionResult> {
  const posts = (await loadPosts()).filter((p) => !PLACEHOLDER.test(`${p.title} ${p.meta_description}`));
  const len = (s: string | null) => (s || "").trim().length;
  const short = posts.filter((p) => len(p.meta_description) < 70), long = posts.filter((p) => len(p.meta_description) > 165);
  const titleLong = posts.filter((p) => len(p.meta_title || p.title) > 65);
  const dupTitle = (() => { const m = new Map<string, PostRow[]>(); for (const p of posts) { const k = (p.title || "").trim().toLowerCase(); if (k) m.set(k, [...(m.get(k) || []), p]); } return [...m.values()].filter((v) => v.length > 1); })();
  const eg = (rows: PostRow[]) => rows.slice(0, 3).map((p) => `"${(p.title || "").slice(0, 50)}"`).join(", ");
  const lines = [
    `Checked ${posts.length} published posts (private source-paper placeholders skipped).`,
    `Descriptions too short (under 70 characters): ${short.length}${short.length ? `, for example ${eg(short)}` : ""}.`,
    `Descriptions too long (over 165, Google cuts them): ${long.length}${long.length ? `, for example ${eg(long)}` : ""}.`,
    `Titles over 65 characters: ${titleLong.length}${titleLong.length ? `, for example ${eg(titleLong)}` : ""}.`,
    `Posts sharing the same title as another: ${dupTitle.reduce((n, v) => n + v.length, 0)} in ${dupTitle.length} groups${dupTitle.length ? `, for example "${(dupTitle[0][0].title || "").slice(0, 50)}"` : ""}.`,
  ];
  const fixable = short.length + long.length;
  lines.push(fixable ? `I can rewrite the ${fixable} weak descriptions for you, keeping the old text so you can undo. Say "fix the SEO descriptions".` : "Descriptions all look healthy.");
  return { text: lines.join("\n"), links: [{ label: "Polished blogs", href: "/admin/polish" }, { label: "Repeated pages", href: "/admin/duplicates" }] };
}

async function runSeoFix(limit: number): Promise<ActionResult> {
  const n = Math.max(1, Math.min(15, limit));
  const posts = (await loadPosts(true)).filter((p) => !PLACEHOLDER.test(`${p.title} ${p.meta_description}`));
  const len = (s: string | null) => (s || "").trim().length;
  const weak = posts.filter((p) => len(p.meta_description) < 70 || len(p.meta_description) > 165).sort((x, y) => len(x.meta_description) - len(y.meta_description)).slice(0, n);
  if (!weak.length) return { text: "Nothing to fix: every description is between 70 and 165 characters." };
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token; if (!token) throw new Error("Log in as an administrator first.");
  const r = await fetch("/api/ai?task=seo", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ items: weak.map((p) => ({ id: p.id, title: p.title, snippet: (p.content || "").replace(/[#*_>`|-]+/g, " ").replace(/\s+/g, " ").slice(0, 600) })) }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "The writer could not answer.");
  const done: { id: string; old: string }[] = [];
  for (const res of (j.results || []) as { id: string; description: string }[]) {
    const post = weak.find((p) => p.id === res.id); if (!post) continue;
    const { error } = await (supabase as any).from("articles").update({ meta_description: res.description, updated_at: new Date().toISOString() }).eq("id", post.id);
    if (!error) done.push({ id: post.id, old: post.meta_description || "" });
  }
  if (!done.length) throw new Error("The writer returned nothing usable. Nothing was changed.");
  const { error: logErr } = await (supabase as any).rpc("admin_agent_log", { p_capability: "seo_fix", p_summary: `Rewrote ${done.length} search descriptions.`, p_detail: { ids: done.map((d) => d.id) }, p_undo: { type: "article_field", field: "meta_description", items: done } });
  const noLog = logErr ? " (I could not record it in the log, so Undo is not available: run autopilot-2.sql.)" : "";
  return { text: `Rewrote ${done.length} of ${weak.length} weak descriptions.${noLog} Ask me to scan again to see what is left.`, links: [{ label: "See the log and undo", href: "/admin/autopilot" }] };
}

/** Read-only questions: answered straight away, nothing is changed. */
export async function runReadOnly(action: AgentAction, w: AgentWorld): Promise<ActionResult | null> {
  const a = action.args || {};
  if (action.tool === "seo_scan") return runSeoScan();
  if (action.tool === "site_stats") {
    const { data, error } = await (supabase as any).rpc("admin_site_stats", { p_days: Math.max(1, Math.min(90, Number(a.days) || 7)) });
    if (error) throw new Error(error.message);
    const t = data?.totals || data || {};
    return { text: `Visitors, last ${data?.days ?? a.days ?? 7} days: ${JSON.stringify(t).slice(0, 400)}`, links: [{ label: "Full visitor report", href: "/admin/analytics" }] };
  }
  if (action.tool === "contest_report") {
    const c = w.contests.find((x) => x.slug === a.slug); if (!c) throw new Error("I could not find that contest.");
    const rows = await loadAdminContestRegistrations(c.id);
    const by = new Map<string, number>(); for (const r of rows) { const k = r.contest_universities?.abbreviation || r.contest_universities?.name || "?"; by.set(k, (by.get(k) || 0) + 1); }
    const verified = rows.filter((r) => r.status === "verified").length;
    return { text: `"${c.title}": ${rows.length} registered (${verified} confirmed). ${[...by].map(([k, v]) => `${k} ${v}`).join(", ") || "Nobody yet."}`, links: [{ label: "Open the contest", href: `/contests/${c.slug}` }, { label: "Contest settings", href: `/admin/contests/setup?contest=${c.id}` }] };
  }
  return null;
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
