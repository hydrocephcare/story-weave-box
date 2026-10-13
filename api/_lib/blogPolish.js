// POST /api/ai-polish { id }: polishes one Year 1 to 3 blog the first time anyone opens it, and keeps the result for everyone.
//   - a clear title and a search description
//   - notes in the style of the Year 4 notes (intro, numbered sections, practice questions); question banks and papers only laid out properly
//   - a verdict (keep / review / irrelevant) that the admin can act on; nothing is ever deleted here
// Very long pages are left to the batch job (scripts/blogs/polish-batch.mjs). The stored article is never changed: the result is saved in
// blog_polish, which the page reads. Writing needs POLISH_WRITE_KEY in Vercel (made on /admin/polish): the database checks it, so the Supabase service key is not needed.
import { askModel } from "../../supabase/functions/_shared/topicAi.js";
import { yearOf } from "./blogPolishCore.js";
import { metaFor, polishArticle, polishStep } from "./blogPolishRun.js";

const SB = process.env.SUPABASE_URL || "https://lkgfzjwhmfjvntzphbsh.supabase.co";
const ANON = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrZ2Z6andobWZqdm50enBoYnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3Nzk5MjIsImV4cCI6MjA4NzM1NTkyMn0.a2QY6TxzKNM2AhuuoDkgdKifI3XhSGhYRlhpqZpvAwo"; // the public key every visitor's browser already has
const WRITE_KEY = () => process.env.POLISH_WRITE_KEY || "";
const DAILY_CAP = Number(process.env.POLISH_DAILY_CAP || 40);
const hits = new Map(); // per visitor, per hour (best effort)
const LIMIT = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sb(path, { method = "GET", body, headers = {} } = {}) {
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY; // used only if it is set; otherwise the write key does the job
  const key = service || ANON;
  const r = await fetch(`${SB}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, ...(service ? {} : { "x-polish-key": WRITE_KEY() }), "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { ok: r.ok, status: r.status, json, headers: r.headers };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ status: "invalid" });
  const groq = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
  const gem = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
  if (!(process.env.SUPABASE_SERVICE_ROLE_KEY || WRITE_KEY()) || (!groq.trim() && !gem.trim())) return res.status(503).json({ status: "unavailable" });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const mine = (hits.get(ip) || []).filter((t) => now - t < 3_600_000);
  if (mine.length >= LIMIT) return res.status(429).json({ status: "busy" });
  hits.set(ip, [...mine, now]);
  if (hits.size > 5000) hits.clear();

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const id = String(body.id ?? "");
  if (!UUID.test(id)) return res.status(400).json({ status: "invalid" });

  // only public, published Year 1 to 3 blogs
  const got = await sb(`articles?select=id,title,category,content,published,deleted_at,password_protected&id=eq.${id}`);
  const a = got.json?.[0];
  if (!a || !a.published || a.deleted_at || a.password_protected || ![1, 2, 3, 4, 5, 6].includes(yearOf(a.category))) return res.status(404).json({ status: "invalid" });

  // already finished, or being worked on: nothing to do. A finished page is never polished again.
  // (a database that does not have the progress column yet is read without it, and long pages are then only given their title and description)
  const withProgress = await sb(`blog_polish?select=status,updated_at,parts_done,content,title&article_id=eq.${id}`);
  const hasProgress = withProgress.ok;
  const existing = (hasProgress ? withProgress : await sb(`blog_polish?select=status,updated_at,content,title&article_id=eq.${id}`)).json?.[0];
  const ageS = existing ? (now - new Date(existing.updated_at).getTime()) / 1000 : 0;
  const long = a.content.length > 14000;
  // a long page that is part-way carries on a few seconds after the last piece; anything else waits (a slow page an hour, a failure twelve hours)
  const carryOn = existing?.status === "partial" && long && ageS > 12;
  const retry = (existing?.status === "failed" && ageS > 12 * 3600) || (existing?.status === "partial" && !long && ageS > 3600) || (existing?.status === "working" && ageS > 720);
  if (existing && !(carryOn || retry)) return res.status(200).json({ status: existing.status, more: false });

  // only when the AI has room: if several pages failed in the last half hour the keys have run out, so nobody is made to wait for nothing
  const recent = new Date(now - 30 * 60_000).toISOString();
  const failures = await sb(`blog_polish?select=article_id&status=eq.${"failed"}&updated_at=gte.${recent}&limit=1`, { headers: { Prefer: "count=exact", Range: "0-0" } });
  if (Number(String(failures.headers.get("content-range") || "").split("/")[1] || 0) >= 3) return res.status(200).json({ status: existing?.status ?? "busy", more: false });

  // a daily limit on new pages, so visitors cannot use up the AI quota
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const count = await sb(`blog_polish?select=article_id&created_at=gte.${since.toISOString()}&limit=1`, { headers: { Prefer: "count=exact", Range: "0-0" } });
  const used = Number(String(count.headers.get("content-range") || "").split("/")[1] || 0);
  if (used >= DAILY_CAP && !existing) return res.status(429).json({ status: "busy", more: false });

  // claim it, so two visitors do not do the same page
  let claimed;
  if (existing) claimed = await sb(`blog_polish?article_id=eq.${id}&status=eq.${existing.status}`, { method: "PATCH", body: { status: "working", updated_at: new Date().toISOString() }, headers: { Prefer: "return=representation" } });
  else claimed = await sb("blog_polish?on_conflict=article_id", { method: "POST", body: { article_id: id, status: "working" }, headers: { Prefer: "resolution=ignore-duplicates,return=representation" } });
  if (!claimed.json?.length) return res.status(200).json({ status: "working", more: false });

  const env = { GROQ_API_KEYS: groq, GEMINI_API_KEYS: gem };
  const ask = (prompt, timeoutMs, maxTokens) => askModel(prompt, { env, timeoutMs, maxTokens, plain: true }).then((r) => r.text);
  const save = (row) => sb(`blog_polish?article_id=eq.${id}`, { method: "PATCH", body: { ...row, updated_at: new Date().toISOString() } });

  try {
    if (!long) {
      const r = await polishArticle(a, ask, { chunk: false });
      await save({ title: r.title, description: r.description, image_query: r.image_query, content: r.content, verdict: r.verdict, reason: r.reason || null, status: r.status, model: "ai" });
      return res.status(200).json({ status: r.status, more: false });
    }
    // a long page: its title and description first (a small request), then a couple of pieces of the text on each visit
    let row = {};
    if (!hasProgress) { const m = await metaFor(a, ask); await save({ title: m.title, description: m.description, image_query: m.image_query, verdict: m.verdict, reason: [m.reason, "long page: text left for later"].filter(Boolean).join(" | ").slice(0, 400), status: "done", model: "ai" }); return res.status(200).json({ status: "done", more: false }); }
    if (!existing?.title) {
      const m = await metaFor(a, ask);
      row = { title: m.title, description: m.description, image_query: m.image_query, verdict: m.verdict, reason: m.reason || null, model: "ai" };
      if (m.verdict === "irrelevant") { await save({ ...row, status: "done", parts_done: 0 }); return res.status(200).json({ status: "done", more: false }); }
    }
    const step = await polishStep(a, ask, existing ?? {}, { budgetMs: existing?.title ? 36000 : 22000 });
    const note = step.reason ? [row.reason ?? null, step.reason].filter(Boolean).join(" | ").slice(0, 400) : row.reason ?? null;
    await save({ ...row, content: step.content, parts_done: step.parts_done, status: step.finished ? "done" : "partial", reason: note });
    return res.status(200).json({ status: step.finished ? "done" : "partial", more: !step.finished, progress: `${step.parts_done}/${step.total}` });
  } catch (e) {
    // what is already done stays saved; the page is tried again later
    await save({ status: "failed", reason: String(e?.message ?? "failed").slice(0, 200) });
    return res.status(/429|503/.test(String(e?.message)) ? 429 : 502).json({ status: "failed", more: false });
  }
}
