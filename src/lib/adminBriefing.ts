import { supabase } from "@/integrations/supabase/client";
import { loadSiteConfig } from "@/lib/siteConfig";
import { loadPosts, PLACEHOLDER, type ActionResult } from "@/lib/adminAgent";

const db = supabase as any;
export interface Briefing { greeting: string; good: string[]; watch: string[]; suggestions: { label: string; prompt: string }[] }

const hourEAT = () => Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Nairobi" }).format(new Date()));
const sum = (rows: { visitors?: number; views?: number }[], k: "visitors" | "views") => rows.reduce((n, r) => n + Number(r[k] || 0), 0);
const daysUntil = (iso: string) => Math.round((new Date(`${iso}T00:00:00+03:00`).getTime() - Date.now()) / 86_400_000);
const MILESTONES = [100, 250, 500, 1000, 2500, 5000, 10000];

/** The morning briefing: what really happened on the site (front end and back end), what to celebrate, what needs a look, and a few reasonable next steps. All from your own data. */
export async function runBriefing(): Promise<ActionResult> {
  const good: string[] = [], watch: string[] = [], suggestions: Briefing["suggestions"] = [];
  const h = hourEAT();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";

  // front end: visitors
  const st = await db.rpc("admin_site_stats", { p_days: 14 });
  if (!st.error && st.data) {
    const daily = (st.data.daily || []) as { day: string; visitors: number; views: number }[];
    const last = daily.slice(-7), prev = daily.slice(-14, -7);
    const vNow = sum(last, "visitors"), vPrev = sum(prev, "visitors"), wNow = sum(last, "views");
    const g = vPrev > 0 ? Math.round(((vNow - vPrev) / vPrev) * 100) : null;
    if (g !== null && g >= 10) good.push(`Congratulations: ${vNow.toLocaleString()} visitors this week, up ${g}% on last week.`);
    else if (g !== null && g <= -15) watch.push(`Visitors are down ${Math.abs(g)}% on last week (${vNow.toLocaleString()} against ${vPrev.toLocaleString()}). Sharing the newest notes on WhatsApp usually helps.`);
    else if (vNow) good.push(`${vNow.toLocaleString()} visitors and ${wNow.toLocaleString()} page views this week. Steady.`);
    const crossed = MILESTONES.filter((m) => vNow >= m && vPrev < m).pop();
    if (crossed) good.push(`Milestone: you passed ${crossed.toLocaleString()} visitors in a week for the first time. 🎉`);
    const best = [...daily].sort((a, b) => b.visitors - a.visitors)[0];
    if (best && daily.length > 3 && best.day === daily[daily.length - 1]?.day) good.push(`Yesterday or today is your busiest day in two weeks (${best.visitors} visitors).`);
    const top = (st.data.top || [])[0];
    if (top) { good.push(`Most read this week: ${top.path} (${top.views} views).`); if (/^\/(blog|notes)\//.test(top.path)) suggestions.push({ label: "Make MCQs for the most-read page", prompt: `Find the post at ${top.path} and make 10 MCQs and flashcards from it` }); }
    if (st.data.online?.total) good.push(`${st.data.online.total} people are on the site right now.`);
  }

  // front end: people and messages
  const day = new Date(Date.now() - 86_400_000).toISOString(), week = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const newDay = await db.from("profiles").select("user_id", { count: "exact", head: true }).gte("created_at", day);
  const newWeek = await db.from("profiles").select("user_id", { count: "exact", head: true }).gte("created_at", week);
  if (!newWeek.error && (newWeek.count ?? 0) > 0) good.push(`${newWeek.count} new student accounts this week${!newDay.error && newDay.count ? ` (${newDay.count} in the last day)` : ""}.`);
  const comments = await db.from("note_comments").select("id", { count: "exact", head: true }).gte("created_at", day);
  if (!comments.error && comments.count) { watch.push(`${comments.count} new comment${comments.count === 1 ? "" : "s"} on notes in the last day. Worth a quick read.`); suggestions.push({ label: "Open comments", prompt: "Take me to the comments page" }); }

  // what students searched for and did not find
  const sq = await db.from("search_queries").select("normalized_query,results_count").gte("created_at", week).eq("results_count", 0).limit(2000);
  if (!sq.error && sq.data?.length) {
    const m = new Map<string, number>(); for (const r of sq.data as any[]) { const k = String(r.normalized_query || "").trim(); if (k.length > 3) m.set(k, (m.get(k) || 0) + 1); }
    const top = [...m].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (top.length) {
      watch.push(`Students searched and found nothing: ${top.map(([q, n]) => `"${q}" (${n}×)`).join(", ")}.`);
      for (const [q] of top.slice(0, 2)) suggestions.push({ label: `Write a note on "${q}"`, prompt: `Write a note on ${q}` });
    }
  }

  // back end: queues
  const access = await db.from("student_access").select("user_id", { count: "exact", head: true }).eq("status", "pending");
  if (!access.error && access.count) { watch.push(`${access.count} book-access request${access.count === 1 ? "" : "s"} waiting.`); suggestions.push({ label: "Review access requests", prompt: "Take me to Autopilot" }); }
  const aiDrafts = await db.from("ai_drafts").select("id", { count: "exact", head: true }).eq("status", "pending");
  if (!aiDrafts.error && aiDrafts.count) { watch.push(`${aiDrafts.count} AI-written note${aiDrafts.count === 1 ? "" : "s"} waiting for your review.`); suggestions.push({ label: "Review AI notes", prompt: "Take me to the AI notes to approve page" }); }
  try {
    const posts = (await loadPosts()).filter((p) => !PLACEHOLDER.test(`${p.title} ${p.meta_description}`));
    const weak = posts.filter((p) => (p.meta_description || "").trim().length < 70 || (p.meta_description || "").trim().length > 165).length;
    if (weak) { watch.push(`${weak} posts have a weak search description.`); suggestions.push({ label: `Fix ${Math.min(weak, 15)} descriptions`, prompt: "Fix the SEO descriptions" }); }
    else good.push(`All ${posts.length} posts have healthy search descriptions.`);
  } catch { /* skip */ }

  // the academic calendar: CATs and end of teaching
  try {
    const cfg = await loadSiteConfig();
    for (const kd of cfg.keyDates) {
      const d = daysUntil(kd.date);
      if (d < -3 || d > 30) continue;
      if (/cat|exam/i.test(kd.label)) {
        watch.push(d > 0 ? `${kd.label} start in ${d} day${d === 1 ? "" : "s"}. Students will be revising.` : `${kd.label} are on now.`);
        suggestions.push({ label: "Publish revision MCQs for CATs", prompt: "I will paste notes for CAT revision: make MCQs and flashcards" });
      } else if (d > 0) watch.push(`${kd.label} is in ${d} day${d === 1 ? "" : "s"}.`);
    }
  } catch { /* skip */ }

  // contests
  const cs = await db.from("contests").select("title,slug,status,starts_at").in("status", ["registration", "live"]).eq("published", true).limit(3);
  if (!cs.error && cs.data?.length) {
    for (const c of cs.data as any[]) {
      const reg = await db.from("contest_registrations").select("id", { count: "exact", head: true }).eq("contest_id", (await db.from("contests").select("id").eq("slug", c.slug).maybeSingle()).data?.id ?? "").neq("status", "withdrawn");
      good.push(`"${c.title}" is ${c.status === "live" ? "live" : "open for registration"}${!reg.error ? ` with ${reg.count ?? 0} registered` : ""}.`);
    }
  }

  if (!suggestions.length) suggestions.push({ label: "Check everything", prompt: "Check everything and fix what you can" });
  suggestions.push({ label: "Full health check", prompt: "How is my site doing? Is it growing?" });
  return { text: `${greeting}, here is your briefing.`, briefing: { greeting, good, watch, suggestions: suggestions.slice(0, 5) } as Briefing };
}
