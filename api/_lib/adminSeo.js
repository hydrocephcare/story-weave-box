// POST /api/ai?task=seo { items: [{ id, title, snippet, current }] }: admin only. Writes a search description (110-155 characters) for each post. It only returns text;
// the browser saves it (and logs the old text so Undo can put it back).
import { isAdmin } from "./adminAgent.js";
const list = (v) => [...new Set(String(v ?? "").split(/[\s,]+/).map((k) => k.trim()).filter(Boolean))];
let turn = 0;

const PROMPT = `You write search-result descriptions for a free medical study website (notes, past papers, MCQs for medical students).
For each item write ONE description of 110 to 155 characters, plain English, specific to the topic, starting with what the page is (for example "Past paper questions and answers on ..." or "Clear notes on ... for medical students"). No quotation marks, no emojis, no clickbait, no file names or codes, no claims you cannot see in the text. If the text is empty, describe only from the title.
Return ONLY JSON: {"results":[{"id":"...","description":"..."}]}`;

async function groq(msgs, keys) {
  const models = list(process.env.GROQ_CHAT_MODELS || "openai/gpt-oss-120b,openai/gpt-oss-20b");
  const start = keys.length ? turn++ % keys.length : 0;
  for (let i = 0; i < keys.length; i++) for (const model of models) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${keys[(start + i) % keys.length]}` }, body: JSON.stringify({ model, messages: msgs, response_format: { type: "json_object" }, temperature: 0.3 }) });
      if (!r.ok) continue;
      const t = (await r.json())?.choices?.[0]?.message?.content; if (t) return t;
    } catch { /* next */ }
  }
  return null;
}
async function gemini(msgs, keys) {
  const models = list(process.env.GEMINI_CHAT_MODELS || "gemini-2.5-flash,gemini-2.5-flash-lite");
  const start = keys.length ? turn++ % keys.length : 0;
  for (let i = 0; i < keys.length; i++) for (const model of models) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": keys[(start + i) % keys.length] }, body: JSON.stringify({ systemInstruction: { parts: [{ text: msgs[0].content }] }, contents: [{ role: "user", parts: [{ text: msgs[1].content }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.3 } }) });
      if (!r.ok) continue;
      const t = (await r.json())?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join(""); if (t?.trim()) return t;
    } catch { /* next */ }
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !(await isAdmin(token))) return res.status(403).json({ error: "Administrators only." });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 15).map((x) => ({ id: String(x?.id ?? ""), title: String(x?.title ?? "").slice(0, 200), snippet: String(x?.snippet ?? "").slice(0, 700) })).filter((x) => x.id);
  if (!items.length) return res.status(400).json({ error: "Nothing to write." });
  const msgs = [{ role: "system", content: PROMPT }, { role: "user", content: JSON.stringify(items) }];
  const g = list(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY), m = list(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY);
  const raw = (g.length && (await groq(msgs, g))) || (m.length && (await gemini(msgs, m)));
  if (!raw) return res.status(502).json({ error: "The writer is busy. Try again in a moment." });
  let out; try { out = JSON.parse(String(raw).replace(/^```(?:json)?|```$/gm, "").trim()); } catch { return res.status(502).json({ error: "The writer gave an unreadable answer." }); }
  const ids = new Set(items.map((x) => x.id));
  const results = (Array.isArray(out.results) ? out.results : []).filter((r) => r && ids.has(String(r.id)) && typeof r.description === "string").map((r) => ({ id: String(r.id), description: r.description.replace(/["“”]/g, "").replace(/\s+/g, " ").trim() })).filter((r) => r.description.length >= 90 && r.description.length <= 165);
  return res.status(200).json({ results });
}
