// POST /api/ai?task=draft { query, answer, year }: keeps a good Ompath AI answer, for a search the site had no notes for, as a DRAFT for the admin to approve.
// Nothing is published here. GET /api/ai?task=health (with the polish key in x-polish-key) reports which AI keys work, for the admin Activity page.
const SB = process.env.SUPABASE_URL || "https://dekyjrfwvavtoivqivno.supabase.co";
const ANON = process.env.SUPABASE_ANON_KEY || "sb_publishable_jOXeiFMWJj1z_M-zShimXA_cG9f2QxL";
const WRITE_KEY = () => process.env.POLISH_WRITE_KEY || "";
const MAX_PENDING = 200;
const hits = new Map();

const sb = async (path, { method = "GET", body, headers = {} } = {}) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { method, headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "x-polish-key": WRITE_KEY(), "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let json = null; try { json = t ? JSON.parse(t) : null; } catch { /* not json */ }
  return { ok: r.ok, status: r.status, json, headers: r.headers };
};

const keyOf = (q) => String(q).toLowerCase().replace(/\b(notes?|on|about|explain|please|give|me|the|of|for|a|an)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);

export async function draft(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!WRITE_KEY()) return res.status(503).json({ ok: false });
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
  // only a real, structured study answer on a medical topic: not small talk, a refusal or an error
  const headings = (answer.match(/^#{1,4}\s+\S/gm) || []).length + (answer.match(/^\*\*[^*]{3,60}\*\*\s*$/gm) || []).length;
  const bullets = (answer.match(/^\s*[-*•]\s+\S/gm) || []).length;
  if (key.length < 4 || answer.length < 1200 || headings < 2 || bullets < 4 || /(could not reach|i can't help|i cannot help|as an ai)/i.test(answer)) return res.status(200).json({ ok: false, why: "not a full note" });

  const pending = await sb("ai_drafts?select=id&status=eq.pending&limit=1", { headers: { Prefer: "count=exact", Range: "0-0" } });
  if (Number(String(pending.headers.get("content-range") || "").split("/")[1] || 0) >= MAX_PENDING) return res.status(200).json({ ok: false, why: "queue full" });

  const first = answer.match(/^#{1,2}\s+(.+)$/m)?.[1]?.replace(/[*_`]/g, "").trim();
  const title = (first && first.length >= 6 && first.length <= 110 ? first : query.replace(/\b\w/g, (c) => c.toUpperCase())).slice(0, 110);
  const made = await sb("ai_drafts?on_conflict=query_key", { method: "POST", body: { query, query_key: key, title, content: answer, year }, headers: { Prefer: "resolution=ignore-duplicates,return=representation" } });
  if (made.ok && !made.json?.length) {
    // already waiting: count one more student who asked for it (it tells the admin what is wanted)
    const cur = await sb(`ai_drafts?select=asked&query_key=eq.${encodeURIComponent(key)}`);
    const n = Number(cur.json?.[0]?.asked ?? 1);
    await sb(`ai_drafts?query_key=eq.${encodeURIComponent(key)}&status=eq.pending`, { method: "PATCH", body: { asked: n + 1 } });
  }
  return res.status(200).json({ ok: made.ok });
}

export async function health(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const sent = String(req.headers["x-polish-key"] || "");
  if (!WRITE_KEY() || sent !== WRITE_KEY()) return res.status(403).json({ error: "no" });
  const test = async (name, url, key, header) => {
    try { const r = await fetch(url, { headers: header(key), signal: AbortSignal.timeout(8000) }); return { provider: name, ok: r.ok, status: r.status }; } catch { return { provider: name, ok: false, status: 0 }; }
  };
  const list = (v) => String(v || "").split(/[,\s]+/).filter(Boolean);
  const out = [];
  for (const k of list(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY)) out.push({ ...(await test("Groq", "https://api.groq.com/openai/v1/models", k, (x) => ({ Authorization: `Bearer ${x}` }))), tail: k.slice(-4) });
  for (const k of list(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY)) out.push({ ...(await test("Gemini", `https://generativelanguage.googleapis.com/v1beta/models?key=${k}`, k, () => ({}))), tail: k.slice(-4) });
  return res.status(200).json({ keys: out, writeKey: true });
}
