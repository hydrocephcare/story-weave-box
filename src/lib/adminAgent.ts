import { supabase } from "@/integrations/supabase/client";
import {
  configureContestRound, createContest, createContestRound, importExamPaperToContestRound, loadAdminContests, loadAdminExamPapers, loadAllContestUniversities,
  setContestUniversityScope, updateContestStage, updateContestDetails, loadAdminContestRegistrations, type AdminExamPaper, type ContestUniversity,
} from "@/lib/contest-store";
import type { ContestStage } from "@/lib/contest";
import type { PosterSpec } from "@/lib/statusPoster";
import { loadCategories, removeItem } from "@/lib/adminWriter";

export interface AgentAction { tool: "create_contest" | "delete_contest" | "set_stage" | "go_to" | "set_autopilot_mode" | "run_autopilot" | "seo_scan" | "seo_fix" | "site_stats" | "contest_report" | "publish_note" | "make_mcqs" | "remove_item" | "create_flashcards" | "write_article" | "find_content" | "clean_notifications" | "notification_report" | "send_notification" | "remember" | "forget" | "site_health" | "update_post" | "publish_post" | "restore_post" | "briefing" | "import_mcqs"; args: Record<string, any> }
export interface AgentContext { memory?: string[]; autorun?: boolean; categories?: string[]; page?: string; problems?: { at: string; what: string }[]; now: string; universities: { slug: string; name: string }[]; exams: string[]; contests: { slug: string; title: string; stage: string }[] }
export interface PlanItem { action: AgentAction; line: string; danger: boolean; ok: boolean }

const nairobiNow = () => new Intl.DateTimeFormat("en-KE", { dateStyle: "full", timeStyle: "short", timeZone: "Africa/Nairobi" }).format(new Date());
const toDate = (local: string) => new Date(`${local}:00+03:00`);

export interface AgentWorld { memory: { id: string; note: string }[]; autorun: boolean; categories: string[]; universities: (ContestUniversity & { active: boolean })[]; papers: AdminExamPaper[]; contests: Awaited<ReturnType<typeof loadAdminContests>> }

export async function loadAgentWorld(): Promise<AgentWorld> {
  const db = supabase as any;
  const [universities, papers, contests, categories, mem, auto] = await Promise.all([loadAllContestUniversities(), loadAdminExamPapers(), loadAdminContests(), loadCategories().catch(() => [] as string[]), db.from("agent_memory").select("id,note").order("at", { ascending: false }).limit(30), db.from("agent_capabilities").select("mode").eq("key", "assistant_autorun").maybeSingle()]);
  return { universities: universities.filter((u) => u.active), papers, contests, categories, memory: mem.error ? [] : (mem.data || []), autorun: !auto.error && auto.data?.mode === "auto" };
}

export function agentContext(w: AgentWorld): AgentContext {
  return { memory: w.memory.map((m) => m.note), autorun: w.autorun, categories: w.categories, now: nairobiNow(), universities: w.universities.map((u) => ({ slug: u.slug, name: u.name })), exams: w.papers.map((p) => p.title), contests: w.contests.map((c) => ({ slug: c.slug, title: c.title, stage: c.stage })) };
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
      const noQuestions = a.exam === "__none__";
      const exam = a.exam && !noQuestions ? pickExam(w.papers, String(a.exam)) : null;
      const start = a.start && !Number.isNaN(toDate(String(a.start)).getTime()) ? toDate(String(a.start)) : null;
      const problems = [!String(a.title || "").trim() && "no title", !all && unis.length < 2 && "needs at least 2 universities", !exam && !noQuestions && "no matching exam found", !start && "no valid start time"].filter(Boolean);
      const when = start ? new Intl.DateTimeFormat("en-KE", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "Africa/Nairobi" }).format(start) : "?";
      return { action, danger: false, ok: problems.length === 0, line: `Create contest "${a.title}" for ${all ? "all universities" : unis.map((u) => u.abbreviation || u.name).join(" + ")}, Year ${(a.years || [1, 2, 3]).join(", ")}, ${noQuestions ? "no questions yet (add them later in contest setup)" : `questions from "${exam?.title ?? "?"}"`}, starting ${when} (EAT) for ${a.minutes || 30} minutes. Registration opens straight away${problems.length ? ` — cannot run: ${problems.join(", ")}` : ""}.` };
    }
    if (action.tool === "delete_contest") {
      const c = w.contests.find((x) => x.slug === a.slug);
      return { action, danger: true, ok: Boolean(c), line: c ? `DELETE the contest "${c.title}" (${c.stage}) permanently, with its registrations and results.` : `Delete contest "${a.slug}" — not found, cannot run.` };
    }
    if (action.tool === "go_to") return { action, danger: false, ok: /^\/admin(\/[a-z0-9-]+)*$/.test(String(a.path)), line: `Open ${a.path}.` };
    if (action.tool === "set_autopilot_mode") return { action, danger: false, ok: ["approve_access", "daily_digest"].includes(a.key) && ["off", "ask", "auto"].includes(a.mode), line: `Set Autopilot job "${a.key}" to ${a.mode}${a.mode === "auto" ? " (it will act on its own, with an Undo in the log)" : ""}.` };
    if (action.tool === "run_autopilot") return { action, danger: false, ok: true, line: "Run the Autopilot jobs now." };
    if (action.tool === "update_post") return { action, danger: false, ok: String(a.query || "").trim().length > 1 && Boolean(a.title || a.meta_description || a.category), line: `Change the post matching "${a.query}": ${[a.title && `title → "${a.title}"`, a.meta_description && "search description", a.category && `category → ${a.category}`].filter(Boolean).join(", ")}. The old values are kept so you can undo.` };
    if (action.tool === "publish_post") return { action, danger: false, ok: String(a.query || "").trim().length > 1, line: `Publish up to 5 unpublished drafts whose title matches "${a.query}".` };
    if (action.tool === "restore_post") return { action, danger: false, ok: Boolean(a.id), line: `Put "${a.label || "the post"}" back the way it was.` };
    if (action.tool === "clean_notifications") return { action, danger: false, ok: true, line: `Clear your notification bell: mark everything read and remove read ones older than ${Math.max(0, Number(a.days) || 14)} days.` };
    if (action.tool === "send_notification") return { action, danger: true, ok: String(a.title || "").trim().length > 2 && String(a.message || "").trim().length > 2 && ["all_users", "subscribers", "study_year"].includes(a.audience), line: `SEND to ${a.audience === "study_year" ? `Year ${a.year} students` : a.audience === "subscribers" ? "subscribers" : "ALL users"}: "${a.title}" — ${String(a.message).slice(0, 140)}${a.link ? ` (link ${a.link})` : ""}. Students will see it and may get an email.` };
    if (action.tool === "remember") return { action, danger: false, ok: String(a.note || "").trim().length > 2, line: `Remember: "${a.note}".` };
    if (action.tool === "forget") return { action, danger: false, ok: String(a.match || "").trim().length > 1, line: `Forget notes that mention "${a.match}".` };
    if (action.tool === "remove_item") return { action, danger: true, ok: Boolean(a.id) && ["articles", "mcq_sets"].includes(a.table), line: `Take "${a.title || "this page"}" off the site (it stays in the database, so it can be brought back).` };
    if (action.tool === "seo_fix") return { action, danger: false, ok: true, line: `Rewrite up to ${Math.min(15, Number(a.limit) || 10)} weak search descriptions with AI. The old text is kept so you can undo it.` };
    const c = w.contests.find((x) => x.slug === a.slug);
    const okStage = ["concept", "registration", "live", "completed"].includes(a.stage);
    return { action, danger: false, ok: Boolean(c) && okStage, line: c && okStage ? `Move "${c.title}" from ${c.stage} to ${a.stage}.` : `Change stage of "${a.slug}" — not found or invalid stage, cannot run.` };
  });
}

export interface ActionLink { label: string; href: string; external?: boolean }
/** What happened, plus where to go next. `partial` means it got part of the way and the links continue from there; `undo` is the action that reverses it. */
export interface HealthSection { title: string; status: "good" | "warn" | "bad"; lines: string[] }
export interface HealthReport { score: number; sections: HealthSection[] }
export interface ActionResult { poster?: PosterSpec; briefing?: { greeting: string; good: string[]; watch: string[]; suggestions: { label: string; prompt: string }[] }; health?: HealthReport; fixes?: AgentAction[]; thumb?: string; text: string; links?: ActionLink[]; undo?: AgentAction; partial?: boolean }
const SITE = "https://www.ompathstudy.com";
const wa = (t: string) => `https://wa.me/?text=${encodeURIComponent(t)}`;

/** Runs one confirmed action with the administrator's own login. If it stops half way it says where, and gives a link to carry on from there. */
export async function runAction(action: AgentAction, w: AgentWorld): Promise<ActionResult> {
  const a = action.args || {};
  if (action.tool === "set_autopilot_mode") { const { error } = await (supabase as any).rpc("admin_agent_set_mode", { p_key: a.key, p_mode: a.mode }); if (error) throw new Error(/schema cache|admin_agent_set_mode/.test(error.message) ? "Run autopilot.sql first." : error.message); return { text: `Autopilot job ${a.key} is now ${a.mode}.`, links: [{ label: "Open Autopilot", href: "/admin/autopilot" }] }; }
  if (action.tool === "run_autopilot") { const { data, error } = await (supabase as any).rpc("admin_agent_run"); if (error) throw new Error(/schema cache|admin_agent_run/.test(error.message) ? "Run autopilot.sql first." : error.message); return { text: `Autopilot ran: ${data?.approved ?? 0} approved, ${data?.queued ?? 0} waiting for you.`, links: [{ label: "See the log", href: "/admin/autopilot" }] }; }
  if (action.tool === "go_to") return { text: `Opened ${a.path}.` };
  if (action.tool === "seo_fix") return runSeoFix(Number(a.limit) || 10);
  if (action.tool === "update_post" || action.tool === "publish_post") {
    const q = String(a.query || "").trim().replace(/[%,()]/g, " ").slice(0, 80);
    const pub = action.tool === "publish_post";
    let query = (supabase as any).from("articles").select("id,title,slug,meta_description,category,published").is("deleted_at", null).ilike("title", `%${q}%`).limit(6);
    query = pub ? query.eq("published", false) : query;
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error(pub ? `No unpublished draft has "${q}" in its title.` : `No post has "${q}" in its title.`);
    if (!pub && data.length > 1) throw new Error(`More than one post matches "${q}": ${data.map((r: any) => `"${r.title}"`).slice(0, 4).join(", ")}. Say which one, using more of its title.`);
    const done: string[] = []; const before: any[] = [];
    for (const row of pub ? data.slice(0, 5) : data) {
      const patch: Record<string, unknown> = pub ? { published: true } : { ...(a.title ? { title: String(a.title).slice(0, 120) } : {}), ...(a.meta_description ? { meta_description: String(a.meta_description).slice(0, 160) } : {}), ...(a.category ? { category: String(a.category) } : {}) };
      const { error: ue } = await (supabase as any).from("articles").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", row.id);
      if (ue) throw new Error(ue.message);
      before.push({ id: row.id, title: row.title, meta_description: row.meta_description, category: row.category, published: row.published }); done.push(row.title);
    }
    return { text: `${pub ? "Published" : "Updated"} ${done.length}: ${done.map((t) => `"${t}"`).join(", ")}.`, links: [{ label: "Open it", href: `/blog/${data[0].slug || data[0].id}` }], undo: { tool: "restore_post", args: { items: before, label: done[0] } } };
  }
  if (action.tool === "restore_post") {
    for (const it of (a.items || []) as any[]) {
      const { error: ue } = await (supabase as any).from("articles").update({ title: it.title, meta_description: it.meta_description, category: it.category, published: it.published, updated_at: new Date().toISOString() }).eq("id", it.id);
      if (ue) throw new Error(ue.message);
    }
    return { text: `Put ${(a.items || []).length} post(s) back the way they were.` };
  }
  if (action.tool === "clean_notifications") {
    const { data, error } = await (supabase as any).rpc("admin_clean_my_notifications", { p_days: Math.max(0, Number(a.days) || 14) });
    if (error) throw new Error(/schema cache|admin_clean/.test(error.message) ? "Run RUN-THESE.sql first." : error.message);
    return { text: `Notification bell cleared: ${data?.marked_read ?? 0} marked read, ${data?.removed ?? 0} old ones removed.` };
  }
  if (action.tool === "send_notification") {
    const { data, error } = await supabase.functions.invoke("send-notification", { body: { title: String(a.title).trim(), message: String(a.message).trim(), action_url: String(a.link || "").trim() || null, audience: a.audience, study_year: a.audience === "study_year" ? Number(a.year) : null } });
    if (error || data?.error) throw new Error(String(data?.error || error?.message || "The notification could not be sent."));
    return { text: `Sent to ${data?.recipients ?? "?"} users${data?.email_configured ? `; ${data.delivered} emails delivered` : " (in the site only: email sending is not configured)"}.`, links: [{ label: "Notifications", href: "/admin#notifications" }] };
  }
  if (action.tool === "remember") {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("agent_memory").insert({ owner: u.user?.id, note: String(a.note).trim().slice(0, 400) });
    if (error) throw new Error(/agent_memory|schema cache/.test(error.message) ? "Run RUN-THESE.sql first, then I can remember things." : error.message);
    return { text: `I will remember: "${a.note}".` };
  }
  if (action.tool === "forget") {
    const hit = w.memory.filter((m) => m.note.toLowerCase().includes(String(a.match).toLowerCase()));
    for (const m of hit) await (supabase as any).from("agent_memory").delete().eq("id", m.id);
    return { text: hit.length ? `Forgot ${hit.length} note(s).` : "I had nothing like that to forget." };
  }
  if (action.tool === "remove_item") { await removeItem(a.table, String(a.id)); return { text: `Took "${a.title || "the page"}" off the site.`, links: [{ label: "Admin home", href: "/admin" }] }; }
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
  const noQuestions = a.exam === "__none__";
  const exam = noQuestions ? null : pickExam(w.papers, String(a.exam || "")); if (!exam && !noQuestions) throw new Error("No matching exam.");
  const minutes = Math.max(5, Math.min(240, Number(a.minutes) || 30));
  const startsAt = toDate(String(a.start)).toISOString(), endsAt = new Date(toDate(String(a.start)).getTime() + minutes * 60_000).toISOString();
  const years = (Array.isArray(a.years) && a.years.length ? a.years : [1, 2, 3]).map(Number).filter((y: number) => y >= 1 && y <= 6);
  let at = "creating the contest", created: { id: string; slug: string } | null = null;
  try {
    created = await createContest({ title: String(a.title).trim(), subtitle: "", subjects: [], years, format: "One round", registrationOpensAt: new Date().toISOString(), registrationClosesAt: startsAt, startsAt, shareImageUrl: null, published: false });
    at = "setting who can enter"; await setContestUniversityScope(created.id, ids, a.autoAdmit !== false);
    at = "adding the round"; const round = await createContestRound(created.id, "Round 1", minutes * 60);
    if (exam) { at = "adding the questions"; await importExamPaperToContestRound(round.id, exam.id); }
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
export const PLACEHOLDER = /awaiting edit|source paper|private source/i;
export interface PostRow { id: string; slug: string | null; title: string | null; meta_title: string | null; meta_description: string | null; content?: string | null }

export async function loadPosts(withContent = false): Promise<PostRow[]> {
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
  if (action.tool === "find_content") {
    const q = String(a.query || "").trim().replace(/[%,()]/g, " ").slice(0, 80);
    if (q.length < 2) throw new Error("Tell me what to look for.");
    const { data, error } = await (supabase as any).from("articles").select("id,title,slug,published,category").is("deleted_at", null).ilike("title", `%${q}%`).order("created_at", { ascending: false }).limit(8);
    if (error) throw new Error(error.message);
    if (!data?.length) return { text: `No post has "${q}" in its title.` };
    return { text: `Found ${data.length}:\n${data.map((r: any) => `• ${r.title}${r.published ? "" : " (draft)"}${r.category ? ` — ${r.category}` : ""}`).join("\n")}`, links: data.slice(0, 4).map((r: any) => ({ label: String(r.title).slice(0, 28), href: `/blog/${r.slug || r.id}` })) };
  }
  if (action.tool === "notification_report") {
    const { data, error } = await (supabase as any).from("user_notifications").select("email_status,email_error,created_at").order("created_at", { ascending: false }).limit(300);
    if (error) throw new Error(error.message);
    const by: Record<string, number> = {}; for (const r of data || []) by[r.email_status] = (by[r.email_status] || 0) + 1;
    const errs = [...new Set((data || []).filter((r: any) => r.email_error).map((r: any) => String(r.email_error).slice(0, 80)))].slice(0, 3);
    return { text: `Last ${data?.length ?? 0} notifications: ${Object.entries(by).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}.${errs.length ? `\nEmail errors seen: ${errs.join(" | ")}` : ""}${by.failed ? "\nFailures usually mean the email service key is missing or a mailbox rejected it; in-site notifications still arrived." : ""}`, links: [{ label: "Notifications", href: "/admin#notifications" }] };
  }
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

export async function askAgent(message: string, history: { role: "user" | "assistant"; content: string }[], context: AgentContext): Promise<{ reply: string; ask: { question: string; options: string[] } | null; actions: AgentAction[] }> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error("Log in as an administrator first.");
  const r = await fetch("/api/ai?task=agent", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ message, history, context }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "The assistant could not answer.");
  return { reply: String(j.reply || ""), ask: j.ask && Array.isArray(j.ask.options) ? { question: String(j.ask.question || ""), options: j.ask.options.map(String) } : null, actions: Array.isArray(j.actions) ? j.actions : [] };
}
