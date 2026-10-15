// POST /api/ai?task=seo { items: [{ id, title, snippet, current }] }: admin only. Writes a search description (110-155 characters) for each post. It only returns text;
// the browser saves it (and logs the old text so Undo can put it back).
import { isAdmin } from "./adminAgent.js";
import { askJson } from "./llm.js";
const list = (v) => [...new Set(String(v ?? "").split(/[\s,]+/).map((k) => k.trim()).filter(Boolean))];

const PROMPT = `You write search-result descriptions for a free medical study website (notes, past papers, MCQs for medical students).
For each item write ONE description of 110 to 155 characters, plain English, specific to the topic, starting with what the page is (for example "Past paper questions and answers on ..." or "Clear notes on ... for medical students"). No quotation marks, no emojis, no clickbait, no file names or codes, no claims you cannot see in the text. If the text is empty, describe only from the title.
Return ONLY JSON: {"results":[{"id":"...","description":"..."}]}`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !(await isAdmin(token))) return res.status(403).json({ error: "Administrators only." });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 15).map((x) => ({ id: String(x?.id ?? ""), title: String(x?.title ?? "").slice(0, 200), snippet: String(x?.snippet ?? "").slice(0, 700) })).filter((x) => x.id);
  if (!items.length) return res.status(400).json({ error: "Nothing to write." });
  const msgs = [{ role: "system", content: PROMPT }, { role: "user", content: JSON.stringify(items) }];
  const got = await askJson(msgs, { prefer: "groq", temperature: 0.3, maxTokens: 3000 });
  if (got.error) return res.status(502).json({ error: got.error });
  const raw = got.text;
  let out; try { out = JSON.parse(String(raw).replace(/^```(?:json)?|```$/gm, "").trim()); } catch { return res.status(502).json({ error: "The writer gave an unreadable answer." }); }
  const ids = new Set(items.map((x) => x.id));
  const results = (Array.isArray(out.results) ? out.results : []).filter((r) => r && ids.has(String(r.id)) && typeof r.description === "string").map((r) => ({ id: String(r.id), description: r.description.replace(/["“”]/g, "").replace(/\s+/g, " ").trim() })).filter((r) => r.description.length >= 90 && r.description.length <= 165);
  return res.status(200).json({ results });
}
