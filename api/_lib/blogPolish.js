// POST /api/ai-polish { id }: polishes a public medical education blog the first time anyone opens it, and keeps the result for everyone.
//   - a clear title and a search description
//   - notes in the style of the Year 4 notes (intro, numbered sections, practice questions); question banks and papers only laid out properly
//   - a verdict (keep / review / irrelevant) that the admin can act on; nothing is ever deleted here
// Very long pages are left to the batch job (scripts/blogs/polish-batch.mjs). The stored article is never changed: the result is saved in
// blog_polish, which the page reads. Writing needs POLISH_WRITE_KEY in Vercel (made on /admin/polish): the database checks it, so the Supabase service key is not needed.
import { askModel } from "../../supabase/functions/_shared/topicAi.js";
import { metaFor, polishArticle, polishStep } from "./blogPolishRun.js";
import { verifyBlogContent } from "./blogPolishVerify.js";
import { getPolishSql, hasPolishWriteKey } from "./neonPolishStore.js";
import { isTrustedBlogWorkflow } from "./blogPolishAuth.js";
import { supabaseAiEnv } from "./supabaseAiEnv.js";

const DAILY_CAP = Number(process.env.POLISH_DAILY_CAP || 40);
const hits = new Map();
const LIMIT = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ status: "invalid" });
  const groq = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
  const gem = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
  const workflow = await isTrustedBlogWorkflow(req.headers.authorization);
  if (!workflow && (!groq.trim() || !gem.trim())) return res.status(503).json({ status: "unavailable" });
  const sql = getPolishSql();
  if (!(await hasPolishWriteKey())) return res.status(503).json({ status: "unavailable" });
  const now = Date.now();

  if (!workflow) {
    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    const mine = (hits.get(ip) || []).filter((t) => now - t < 3_600_000);
    if (mine.length >= LIMIT) return res.status(429).json({ status: "busy" });
    hits.set(ip, [...mine, now]);
    if (hits.size > 5000) hits.clear();
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const id = String(body.id ?? "");
  if (!UUID.test(id)) return res.status(400).json({ status: "invalid" });

  // only public, published blogs
  const got = await sql.query("SELECT id,title,category,content,original_notes,published,deleted_at,password_protected,scheduled_at FROM public.articles WHERE id=$1 LIMIT 1", [id]);
  const a = got[0];
  if (!a || !a.published || a.deleted_at || a.password_protected || (a.scheduled_at && new Date(a.scheduled_at).getTime() > Date.now())) return res.status(404).json({ status: "invalid" });

  // already finished, or being worked on: nothing to do. A finished page is never polished again.
  // (progress on a long page is kept at the top of its saved text as <!--parts:N-->, so no extra database column is needed)
  const existing = (await sql.query("SELECT status,updated_at,content,title,reason,ai_review_status,verdict FROM public.blog_polish WHERE article_id=$1 LIMIT 1", [id]))[0];
  const ageS = existing ? (now - new Date(existing.updated_at).getTime()) / 1000 : 0;
  const long = String(a.content || "").length > 14000;
  const marker = /^<!--parts:(\d+)(?::(\d+))?-->\n?/;
  const doneParts = Number(existing?.content?.match(marker)?.[1] ?? 0);
  const rawParts = Number(existing?.content?.match(marker)?.[2] ?? 0);
  const saved = (existing?.content ?? "").replace(marker, "");
  // a long page that is part-way carries on a few seconds after the last piece; a long page marked done before its text could be done starts now;
  // anything else waits (a slow page an hour, a failure twelve hours)
  const carryOn = existing?.status === "partial" && long; // no wait: the claim below is atomic, so two visitors can never work on the same page at once
  const lateStart = existing?.status === "done" && !existing.content && long && /left for later|too long|rejected in part/i.test(existing.reason ?? "");
  // a long page that had saved progress when the AI hiccuped carries on after a minute; any other failure waits twelve hours
  const resumeFailed = existing?.status === "failed" && long && doneParts > 0 && ageS > 60;
  const retryUnreviewed = existing?.status === "done" && existing.verdict !== "irrelevant" && existing.ai_review_status !== "passed" && ageS > 12 * 3600;
  const retry = resumeFailed || retryUnreviewed || (existing?.status === "failed" && ageS > 12 * 3600) || (existing?.status === "partial" && !long && ageS > 3600) || (existing?.status === "working" && ageS > 720);
  if (existing && !(carryOn || lateStart || retry)) return res.status(200).json({ status: existing.status, more: false });

  // only when the AI has room: if several pages failed in the last half hour the keys have run out, so nobody is made to wait for nothing
  const recent = new Date(now - 30 * 60_000).toISOString();
  const failures = await sql.query("SELECT count(*)::int AS count FROM public.blog_polish WHERE status=$1 AND updated_at >= $2", ["failed", recent]);
  if (Number(failures[0]?.count || 0) >= 3) return res.status(200).json({ status: existing?.status ?? "busy", more: false });

  // a daily limit on new pages, so visitors cannot use up the AI quota
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const count = await sql.query("SELECT count(*)::int AS count FROM public.blog_polish WHERE created_at >= $1", [since.toISOString()]);
  const used = Number(count[0]?.count || 0);
  if (used >= DAILY_CAP && !existing && !workflow) return res.status(429).json({ status: "busy", more: false });

  // claim it, so two visitors do not do the same page
  let claimed;
  if (existing) claimed = await sql.query("UPDATE public.blog_polish SET status=$1, updated_at=now() WHERE article_id=$2 AND status=$3 RETURNING article_id", ["working", id, existing.status]);
  else claimed = await sql.query("INSERT INTO public.blog_polish (article_id,status) VALUES ($1,$2) ON CONFLICT (article_id) DO NOTHING RETURNING article_id", [id, "working"]);
  if (!claimed.length) return res.status(200).json({ status: "working", more: false });

  const env = workflow ? supabaseAiEnv(req, { workflow: true }) : { GROQ_API_KEYS: groq, GEMINI_API_KEYS: gem };
  const ask = (prompt, timeoutMs, maxTokens) => askModel(prompt, { env, timeoutMs, maxTokens, plain: true }).then((r) => r.text);
  const save = async (row) => {
    const allowed = new Set(["title","description","image_query","verdict","reason","model","content","status","ai_review_status","ai_review_model","ai_reviewed_at","ai_review_issues","parts_done"]);
    const entries = Object.entries(row || {}).filter(([key, value]) => allowed.has(key) && value !== undefined);
    if (!entries.length) return [];
    const assignments = entries.map(([key], index) => `${key}=${index + 2}`);
    return sql.query(`UPDATE public.blog_polish SET ${assignments.join(",")}, updated_at=now() WHERE article_id=$1 RETURNING article_id`, [id, ...entries.map(([, value]) => value)]);
  };

  try {
    if (!long) {
      const r = await polishArticle(a, ask, { chunk: false });
      if (r.status !== "done") {
        await save({ title: r.title, description: r.description, image_query: r.image_query, content: null, verdict: r.verdict, reason: r.reason || null, status: "partial", ai_review_status: null, model: "groq" });
        return res.status(200).json({ status: "partial", more: false });
      }
      const review = await verifyBlogContent(a, r.content, env, { allowRepair: true, timeoutMs: 22000 });
      const reason = review.status === "held" ? "Gemini review held for automatic correction: " + (review.issues?.[0]?.problem || "review did not pass") : (r.reason || null);
      await save({ title: r.title, description: r.description, image_query: r.image_query,
        content: review.status === "passed" ? review.content : null, verdict: r.verdict, reason,
        status: "done", model: "groq", ai_review_status: review.status, ai_review_model: review.model,
        ai_reviewed_at: review.at, ai_review_issues: review.issues || [] });
      return res.status(200).json({ status: "done", verified: review.status === "passed", more: false });
    }
    // a long page: its title and description first (a small request), then a couple of pieces of the text on each visit
    let row = {};
    if (!existing?.title) {
      const m = await metaFor(a, ask);
      row = { title: m.title, description: m.description, image_query: m.image_query, verdict: m.verdict, reason: m.reason || null, model: "ai" };
      if (m.verdict === "irrelevant") {
        await save({ ...row, status: "done", ai_review_status: "held", ai_review_model: null, ai_reviewed_at: new Date().toISOString(),
          ai_review_issues: [{ severity: "medium", where: "content type", problem: "This page was classified as not medical study material.", fix: "No medical verification or public-facing AI badge is applied." }] });
        return res.status(200).json({ status: "done", more: false });
      }
    }
    const step = await polishStep(a, ask, { parts_done: doneParts, raw: rawParts, content: saved }, { budgetMs: existing?.title ? 36000 : 22000 });
    const why = step.reason ? [step.reason].filter(Boolean).join(" | ") : (existing?.reason ?? null);
    if (!step.finished) {
      const partialText = "<!--parts:" + step.parts_done + ":" + (step.raw ?? 0) + "-->\n" + (step.content ?? "");
      await save({ ...row, content: partialText, status: "partial", reason: (why ?? "").slice(0, 400) || null, ai_review_status: null });
      return res.status(200).json({ status: "partial", more: true, hiccup: Boolean(step.hiccup), progress: step.parts_done + "/" + step.total });
    }
    const review = await verifyBlogContent(a, step.content, env, { allowRepair: true, timeoutMs: 22000 });
    const reason = review.status === "held" ? "Gemini review held for automatic correction: " + (review.issues?.[0]?.problem || "review did not pass") : (why || null);
    await save({ ...row, content: review.status === "passed" ? review.content : null, status: "done", reason,
      ai_review_status: review.status, ai_review_model: review.model, ai_reviewed_at: review.at, ai_review_issues: review.issues || [] });
    return res.status(200).json({ status: "done", verified: review.status === "passed", more: false, progress: step.parts_done + "/" + step.total });
  } catch (e) {
    // what is already done stays saved; the page is tried again later
    // a long page keeps its progress and carries on; any other page waits before it is tried again
    if (long && doneParts > 0) { await save({ status: "partial", reason: "the AI was busy; carrying on" }); return res.status(200).json({ status: "partial", more: false, hiccup: true }); }
    await save({ status: "failed", reason: String(e?.message ?? "failed").slice(0, 200) });
    return res.status(/429|503/.test(String(e?.message)) ? 429 : 502).json({ status: "failed", more: false });
  }
}
