// POST /api/topic-ai  { name, category?, context? }
// Called by a topic page when the site has little on a subject. It writes a full page with an AI model, saves it in the topic_pages table
// (so the next reader gets it instantly and the model is never asked twice), and returns it. Always answers with a status the page can show:
//   200 published | 202 generating (someone else is already writing it: ask again in a few seconds) | 404 rejected (not a medical topic)
//   429 busy (today's limit reached) | 502 failed | 503 unavailable (the keys are not set up)
// Needs, in Vercel > Settings > Environment Variables: ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY (and VITE_SUPABASE_URL, which is already there).
import { generateTopicPage, slugOf, validName } from "./_lib/topicAi.js";

const TABLE = "topic_pages";
const send = (res, code, body) => { res.setHeader("Cache-Control", "no-store"); return res.status(code).json(body); };

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { status: "method" });
  const body = typeof req.body === "string" ? safeJson(req.body) : req.body || {};
  const name = String(body.name ?? "").trim();
  if (!validName(name)) return send(res, 400, { status: "invalid" });
  const slug = slugOf(name);
  if (!slug || slug.length > 80) return send(res, 400, { status: "invalid" });

  const key = process.env.ANTHROPIC_API_KEY;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !url || !svc) return send(res, 503, { status: "unavailable" });

  const rest = (path, init = {}) => fetch(`${url}/rest/v1/${path}`, { ...init, headers: { apikey: svc, Authorization: `Bearer ${svc}`, "content-type": "application/json", ...(init.headers || {}) } });
  const save = (row) => rest(`${TABLE}?on_conflict=slug`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ slug, name, category: body.category ?? null, updated_at: new Date().toISOString(), ...row }) });

  try {
    const found = await rest(`${TABLE}?slug=eq.${encodeURIComponent(slug)}&select=status,content,updated_at`);
    const rows = found.ok ? await found.json() : [];
    const have = rows[0];
    if (have?.status === "published" && have.content) return send(res, 200, { status: "published", slug, page: have.content });
    if (have?.status === "rejected") return send(res, 404, { status: "rejected" });
    const age = have ? Date.now() - Date.parse(have.updated_at || 0) : Infinity;
    if (have?.status === "generating" && age < 3 * 60_000) return send(res, 202, { status: "generating" });
    if (have?.status === "failed" && age < 5 * 60_000) return send(res, 502, { status: "failed" });

    // a daily limit, so a crawler or a joker cannot run up a bill
    const cap = Number(process.env.TOPIC_AI_DAILY_CAP || 150);
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const count = await rest(`${TABLE}?created_at=gte.${encodeURIComponent(since)}&select=slug`, { headers: { Prefer: "count=exact", Range: "0-0" } });
    const total = Number((count.headers.get("content-range") || "").split("/")[1] || 0);
    if (total >= cap) return send(res, 429, { status: "busy" });

    await save({ status: "generating" });
    let page;
    try {
      page = await generateTopicPage({ name, category: String(body.category ?? ""), context: String(body.context ?? "").slice(0, 6000), apiKey: key, model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5" });
    } catch (e) {
      await save({ status: "failed" });
      return send(res, 502, { status: "failed" });
    }
    if (!page.medical) { await save({ status: "rejected" }); return send(res, 404, { status: "rejected" }); }
    await save({ status: "published", content: page, model: page.model, reviewed: false });
    return send(res, 200, { status: "published", slug, page });
  } catch {
    return send(res, 502, { status: "failed" });
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
