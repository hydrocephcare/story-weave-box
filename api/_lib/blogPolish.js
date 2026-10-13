// POST /api/ai-polish { id }: polishes one Year 1 to 3 blog the first time anyone opens it, and keeps the result for everyone.
//   - a clear title and a search description
//   - notes in the style of the Year 4 notes (intro, numbered sections, practice questions); question banks and papers only laid out properly
//   - a verdict (keep / review / irrelevant) that the admin can act on; nothing is ever deleted here
// Very long pages are left to the batch job (scripts/blogs/polish-batch.mjs). The stored article is never changed: the result is saved in
// blog_polish (needs SUPABASE_SERVICE_ROLE_KEY in Vercel), which the page reads.
import { askModel } from "../../supabase/functions/_shared/topicAi.js";
import { yearOf } from "./blogPolishCore.js";
import { polishArticle } from "./blogPolishRun.js";

const SB = process.env.SUPABASE_URL || "https://lkgfzjwhmfjvntzphbsh.supabase.co";
const DAILY_CAP = Number(process.env.POLISH_DAILY_CAP || 40);
const hits = new Map(); // per visitor, per hour (best effort)
const LIMIT = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sb(path, { method = "GET", body, headers = {} } = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(`${SB}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { ok: r.ok, status: r.status, json, headers: r.headers };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ status: "invalid" });
  const groq = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
  const gem = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || (!groq.trim() && !gem.trim())) return res.status(503).json({ status: "unavailable" });

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

  // already done or being done: nothing to do
  const existing = (await sb(`blog_polish?select=status,updated_at&article_id=eq.${id}`)).json?.[0];
  const ageH = existing ? (now - new Date(existing.updated_at).getTime()) / 3_600_000 : 0;
  if (existing && !((existing.status === "failed" && ageH > 12) || (existing.status === "partial" && ageH > 1) || (existing.status === "working" && ageH > 0.2))) return res.status(200).json({ status: existing.status });

  // a daily limit, so visitors cannot use up the AI quota
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const count = await sb(`blog_polish?select=article_id&created_at=gte.${since.toISOString()}&limit=1`, { headers: { Prefer: "count=exact", Range: "0-0" } });
  const used = Number(String(count.headers.get("content-range") || "").split("/")[1] || 0);
  if (used >= DAILY_CAP && !existing) return res.status(429).json({ status: "busy" });

  // claim it, so two visitors do not do the same page
  let claimed;
  if (existing) claimed = await sb(`blog_polish?article_id=eq.${id}&status=eq.${existing.status}`, { method: "PATCH", body: { status: "working", updated_at: new Date().toISOString() }, headers: { Prefer: "return=representation" } });
  else claimed = await sb("blog_polish?on_conflict=article_id", { method: "POST", body: { article_id: id, status: "working" }, headers: { Prefer: "resolution=ignore-duplicates,return=representation" } });
  if (!claimed.json?.length) return res.status(200).json({ status: "working" });

  const env = { GROQ_API_KEYS: groq, GEMINI_API_KEYS: gem };
  const ask = (prompt, timeoutMs, maxTokens) => askModel(prompt, { env, timeoutMs, maxTokens, plain: true }).then((r) => r.text);
  const save = (row) => sb(`blog_polish?article_id=eq.${id}`, { method: "PATCH", body: { ...row, updated_at: new Date().toISOString() } });

  try {
    const r = await polishArticle(a, ask, { chunk: false });
    await save({ title: r.title, description: r.description, content: r.content, verdict: r.verdict, reason: r.reason || null, status: r.status, model: "ai" });
    return res.status(200).json({ status: r.status });
  } catch (e) {
    await save({ status: "failed", reason: String(e?.message ?? "failed").slice(0, 200) });
    return res.status(/429|503/.test(String(e?.message)) ? 429 : 502).json({ status: "failed" });
  }
}
