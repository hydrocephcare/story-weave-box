// POST /api/ai?task=draft: saves strong, unanswered Ompath AI study notes as drafts for admin approval.
// GET /api/ai?task=health: checks provider keys for the admin Activity page.
import { getPolishSql, verifyPolishWriteKey } from "./neonPolishStore.js";

const WRITE_KEY = () => process.env.POLISH_WRITE_KEY || "";
const MAX_PENDING = 200;
const hits = new Map();

const keyOf = (q) => String(q).toLowerCase().replace(/\b(notes?|on|about|explain|please|give|me|the|of|for|a|an)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);

export async function draft(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const writeKey = WRITE_KEY();
  if (!writeKey) return res.status(503).json({ ok: false });
  const sql = getPolishSql();
  if (!(await verifyPolishWriteKey(writeKey))) return res.status(503).json({ ok: false });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const mine = (hits.get(ip) || []).filter((t) => now - t < 3_600_000);
  if (mine.length >= 6) return res.status(429).json({ ok: false });
  hits.set(ip, [...mine, now]); if (hits.size > 5000) hits.clear();

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const query = String(body.query ?? "").trim().slice(0, 140);
  const answer = String(body.answer ?? "").trim().slice(0, 20000);
  const year = [1, 2, 3, 4, 5, 6].includes(Number(body.year)) ? Number(body.year) : null;
  const key = keyOf(query);
  const headings = (answer.match(/^#{1,4}\s+\S/gm) || []).length + (answer.match(/^\*\*[^*]{3,60}\*\*\s*$/gm) || []).length;
  const bullets = (answer.match(/^\s*[-*•]\s+\S/gm) || []).length;
  if (key.length < 4 || answer.length < 1200 || headings < 2 || bullets < 4 || /(could not reach|i can't help|i cannot help|as an ai)/i.test(answer)) return res.status(200).json({ ok: false, why: "not a full note" });

  const pending = await sql.query("SELECT count(*)::int AS count FROM public.ai_drafts WHERE status = 'pending'");
  if (Number(pending[0]?.count || 0) >= MAX_PENDING) return res.status(200).json({ ok: false, why: "queue full" });

  const first = answer.match(/^#{1,2}\s+(.+)$/m)?.[1]?.replace(/[*_`]/g, "").trim();
  const title = (first && first.length >= 6 && first.length <= 110 ? first : query.replace(/\b\w/g, (c) => c.toUpperCase())).slice(0, 110);
  const made = await sql.query(
    "INSERT INTO public.ai_drafts (query,query_key,title,content,year) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (query_key) DO NOTHING RETURNING id",
    [query, key, title, answer, year],
  );
  if (!made.length) {
    await sql.query("UPDATE public.ai_drafts SET asked = asked + 1 WHERE query_key = $1 AND status = 'pending'", [key]);
  }
  return res.status(200).json({ ok: true });
}

export async function health(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const sent = String(req.headers["x-polish-key"] || "");
  const writeKey = WRITE_KEY();
  if (!writeKey || sent !== writeKey || !(await verifyPolishWriteKey(writeKey))) return res.status(403).json({ error: "no" });
  const test = async (name, url, key, header) => {
    try { const r = await fetch(url, { headers: header(key), signal: AbortSignal.timeout(8000) }); return { provider: name, ok: r.ok, status: r.status }; }
    catch { return { provider: name, ok: false, status: 0 }; }
  };
  const list = (v) => String(v || "").split(/[ ,\s]+/).filter(Boolean);
  const out = [];
  for (const k of list(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY)) out.push({ ...(await test("Groq", "https://api.groq.com/openai/v1/models", k, (x) => ({ Authorization: `Bearer ${x}` }))), tail: k.slice(-4) });
  for (const k of list(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY)) out.push({ ...(await test("Gemini", `https://generativelanguage.googleapis.com/v1beta/models?key=${k}`, k, () => ({}))), tail: k.slice(-4) });
  return res.status(200).json({ keys: out, writeKey: true });
}
