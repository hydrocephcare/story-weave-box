// POST /api/outline-parse { text, year, semester, unit } (admin only): reads a course outline's text with AI and returns its rows as
// { items: [{ week, topic, lecturer, detail }] }. Groq first, Gemini as the backup (keys in turn), the same as the rest of the site's AI.
import { askModel } from "../../supabase/functions/_shared/topicAi.js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://dekyjrfwvavtoivqivno.supabase.co";
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_jOXeiFMWJj1z_M-zShimXA_cG9f2QxL";

async function isAdmin(token) {
  if (!token) return false;
  try {
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
    if (!u.ok) return false;
    const id = (await u.json())?.id;
    if (!id) return false;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/has_role`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ _user_id: id, _role: "admin" }) });
    return r.ok && (await r.json()) === true;
  } catch { return false; }
}

// Groq first (fast), then every key we have
async function askJson(prompt, env) {
  if (env.GROQ_API_KEYS.trim()) { try { return await askModel(prompt, { env: { GROQ_API_KEYS: env.GROQ_API_KEYS }, timeoutMs: 40000, maxTokens: 6000 }); } catch { /* try Gemini */ } }
  return askModel(prompt, { env, timeoutMs: 40000, maxTokens: 6000 });
}

const PROMPT = (chunk, ctx) => `You read a medical school course outline and list what is taught, week by week.
${ctx}
Return ONLY a JSON object: {"items":[{"week":"Week 3","topic":"short topic name","lecturer":"Dr Name or empty","detail":"one short line or empty"}]}
Rules: one item per lecture or topic; keep the document's own wording for the topic (shortened, no numbering); "week" is "Week N" or a range like "Week 3-4" (empty if the document gives none); never invent lecturers; skip headings, aims, assessment rules, book lists and page numbers.

OUTLINE TEXT:
"""
${chunk}
"""`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!(await isAdmin(token))) return res.status(403).json({ error: "Admin only." });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const text = String(body.text ?? "").replace(/\r/g, "").trim();
  if (text.length < 40) return res.status(400).json({ error: "Paste the outline text first." });
  const ctx = `Year ${Number(body.year) || "?"}, semester ${String(body.semester ?? "?").slice(0, 12)}${body.unit ? `, unit ${String(body.unit).slice(0, 80)}` : ""}.`;
  const env = { GROQ_API_KEYS: process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "", GEMINI_API_KEYS: process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "" };
  // long outlines are read in pieces so nothing is cut off
  const pieces = []; for (let i = 0; i < Math.min(text.length, 60000); i += 7000) pieces.push(text.slice(i, i + 7500));
  const items = []; const seen = new Set();
  try {
    for (const piece of pieces) {
      let parsed = null;
      for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
        try {
          const { text: out } = await askJson(PROMPT(piece, ctx), env);
          const m = out.match(/\{[\s\S]*\}/);
          parsed = m ? JSON.parse(m[0]) : null;
        } catch { parsed = null; }
      }
      for (const r of Array.isArray(parsed?.items) ? parsed.items : []) {
        const topic = String(r?.topic ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
        if (topic.length < 3) continue;
        const key = `${r.week}|${topic}`.toLowerCase();
        if (seen.has(key)) continue; seen.add(key);
        items.push({ week: String(r.week ?? "").slice(0, 20), topic, lecturer: String(r.lecturer ?? "").slice(0, 80), detail: String(r.detail ?? "").slice(0, 200) });
      }
    }
  } catch { /* fall through with what was read */ }
  if (!items.length) return res.status(502).json({ error: "The AI could not read this outline. Try again, or paste a cleaner copy." });
  return res.status(200).json({ items: items.slice(0, 400) });
}
