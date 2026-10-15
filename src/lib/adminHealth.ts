import { supabase } from "@/integrations/supabase/client";
import { loadPosts, PLACEHOLDER, type ActionResult, type AgentAction, type HealthSection } from "@/lib/adminAgent";

const db = supabase as any;
const sum = (rows: { visitors?: number; views?: number }[], k: "visitors" | "views") => rows.reduce((n, r) => n + Number(r[k] || 0), 0);
const pct = (now: number, before: number) => (before <= 0 ? (now > 0 ? 100 : 0) : Math.round(((now - before) / before) * 100));
const count = async (q: any) => { const r = await q; return r.error ? null : (r.count ?? 0); };

/** A plain-language health report of the whole site: visitors and growth, content quality, and what is waiting for you. Each problem it can fix comes with a fix. */
export async function runSiteHealth(): Promise<ActionResult> {
  const sections: HealthSection[] = [];
  const fixes: AgentAction[] = [];
  let score = 100;

  // visitors and growth: this week against the week before
  const st = await db.rpc("admin_site_stats", { p_days: 14 });
  if (!st.error && st.data) {
    const daily = (st.data.daily || []) as { day: string; visitors: number; views: number }[];
    const last = daily.slice(-7), prev = daily.slice(-14, -7);
    const vNow = sum(last, "visitors"), vPrev = sum(prev, "visitors"), wNow = sum(last, "views"), wPrev = sum(prev, "views");
    const g = pct(vNow, vPrev);
    const lines = [
      `Visitors this week: ${vNow.toLocaleString()} (${prev.length ? `${g >= 0 ? "+" : ""}${g}% vs the week before` : "no earlier week to compare yet"}).`,
      `Page views this week: ${wNow.toLocaleString()} (${wPrev ? `${pct(wNow, wPrev) >= 0 ? "+" : ""}${pct(wNow, wPrev)}%` : "n/a"}). Returning visitors in 14 days: ${st.data.returning ?? 0}.`,
      `On the site right now: ${st.data.online?.total ?? 0} (${st.data.online?.members ?? 0} signed in).`,
    ];
    const top = (st.data.top || []).slice(0, 3).map((t: any) => `${t.path} (${t.views})`);
    if (top.length) lines.push(`Most read: ${top.join(", ")}.`);
    const dev = (st.data.devices || []).map((d: any) => `${d.device} ${d.visitors}`).join(", ");
    if (dev) lines.push(`Devices: ${dev}.`);
    const status = !prev.length ? "good" : g >= 5 ? "good" : g >= -10 ? "warn" : "bad";
    if (status === "bad") score -= 15; else if (status === "warn") score -= 5;
    lines.push(!prev.length ? "Growth: too early to tell." : g >= 5 ? "Growth: the site is growing." : g >= -10 ? "Growth: flat." : "Growth: shrinking. Check what changed and share the newest notes.");
    sections.push({ title: "Visitors and growth", status, lines });
  } else sections.push({ title: "Visitors and growth", status: "warn", lines: ["I could not read the visitor numbers."] });

  // content quality
  try {
    const posts = (await loadPosts()).filter((p) => !PLACEHOLDER.test(`${p.title} ${p.meta_description}`));
    const len = (s: string | null) => (s || "").trim().length;
    const weak = posts.filter((p) => len(p.meta_description) < 70 || len(p.meta_description) > 165).length;
    const longTitle = posts.filter((p) => len(p.meta_title || p.title) > 65).length;
    const seen = new Map<string, number>(); for (const p of posts) { const k = (p.title || "").trim().toLowerCase(); if (k) seen.set(k, (seen.get(k) || 0) + 1); }
    const dup = [...seen.values()].filter((n) => n > 1).reduce((n, v) => n + v, 0);
    const drafts = await count(db.from("articles").select("id", { count: "exact", head: true }).eq("published", false).is("deleted_at", null));
    const aiDrafts = await count(db.from("ai_drafts").select("id", { count: "exact", head: true }).eq("status", "pending"));
    const lines = [`${posts.length} published posts checked.`, `Search descriptions needing a rewrite: ${weak}. Titles over 65 characters: ${longTitle}. Posts sharing a title: ${dup}.`];
    if (drafts) lines.push(`${drafts} unpublished drafts.`);
    if (aiDrafts) lines.push(`${aiDrafts} AI-written notes waiting for your review.`);
    const bad = weak + longTitle + dup;
    const status = bad === 0 ? "good" : bad < 25 ? "warn" : "bad";
    if (status === "warn") score -= 8; else if (status === "bad") score -= 18;
    if (weak) fixes.push({ tool: "seo_fix", args: { limit: 15 } });
    if (dup) lines.push("Repeated pages are listed under Admin > Repeated pages.");
    if (aiDrafts) fixes.push({ tool: "go_to", args: { path: "/admin/drafts" } });
    sections.push({ title: "Content and SEO", status, lines });
  } catch (e: any) { sections.push({ title: "Content and SEO", status: "warn", lines: [`I could not read the posts: ${e?.message || "error"}`] }); }

  // waiting for you
  const access = await count(db.from("student_access").select("user_id", { count: "exact", head: true }).eq("status", "pending"));
  const appeals = await count(db.from("contest_appeals").select("id", { count: "exact", head: true }).in("status", ["open", "reviewing"]));
  const unread = await count(db.from("user_notifications").select("id", { count: "exact", head: true }).is("read_at", null));
  const failedMail = await count(db.from("user_notifications").select("id", { count: "exact", head: true }).eq("email_status", "failed"));
  const waiting: string[] = [];
  if (access) { waiting.push(`${access} book-access requests to review.`); fixes.push({ tool: "go_to", args: { path: "/admin/autopilot" } }); }
  if (appeals) { waiting.push(`${appeals} contest appeals open.`); fixes.push({ tool: "go_to", args: { path: "/admin/contests/appeals" } }); }
  if (unread) { waiting.push(`${unread} unread notifications.`); fixes.push({ tool: "clean_notifications", args: { days: 14 } }); }
  if (failedMail) waiting.push(`${failedMail} notification emails failed to send (the in-site message still arrived).`);
  const wStatus = waiting.length === 0 ? "good" : waiting.length > 2 ? "warn" : "good";
  if (wStatus === "warn") score -= 5;
  sections.push({ title: "Waiting for you", status: wStatus, lines: waiting.length ? waiting : ["Nothing is waiting."] });

  // contests
  const live = await count(db.from("contests").select("id", { count: "exact", head: true }).in("status", ["registration", "live"]).eq("published", true));
  const regs = await count(db.from("contest_registrations").select("id", { count: "exact", head: true }).neq("status", "withdrawn"));
  sections.push({ title: "Contests", status: "good", lines: [`${live ?? 0} open or live. ${regs ?? 0} registrations in total.`] });

  const seen2 = new Set<string>(); const uniq = fixes.filter((f) => { const k = f.tool + JSON.stringify(f.args); if (seen2.has(k)) return false; seen2.add(k); return true; });
  return {
    text: `Site health: ${Math.max(0, score)} / 100.`,
    health: { score: Math.max(0, score), sections },
    links: [{ label: "Visitors in detail", href: "/admin/analytics" }, { label: "Autopilot", href: "/admin/autopilot" }],
    fixes: uniq.filter((f) => f.tool !== "go_to"),
  };
}
