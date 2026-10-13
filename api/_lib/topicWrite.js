// POST /api/topic-write { name, category, context }: writes a topic page with Gemini and returns it. The browser then saves it with the
// publish_topic_page database function. Keys live only here, in the GEMINI_API_KEYS setting (comma separated); they take turns.
import { generateWithFallback, validName } from "../../supabase/functions/_shared/topicAi.js";
import { pickSubject } from "../../supabase/functions/_shared/topicParts.js";

const hits = new Map(); // per visitor, per hour (best effort: a cold start forgets it)
const LIMIT = 30;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ status: "invalid" });
  const keys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
  const groq = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
  if (!keys.trim() && !groq.trim()) return res.status(503).json({ status: "unavailable" });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const mine = (hits.get(ip) || []).filter((t) => now - t < 3_600_000);
  if (mine.length >= LIMIT) return res.status(429).json({ status: "busy" });
  hits.set(ip, [...mine, now]);
  if (hits.size > 5000) hits.clear();

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const name = String(body.name ?? "").trim();
  if (!validName(name)) return res.status(400).json({ status: "invalid" });
  try {
    const input = { name, category: String(body.category ?? "").slice(0, 60), context: String(body.context ?? "").slice(0, 3000), timeoutMs: 45000 };
    const page = await generateWithFallback(input, { GROQ_API_KEYS: groq, GEMINI_API_KEYS: keys });
    if (!page.medical) return res.status(200).json({ status: "rejected" });
    return res.status(200).json({ status: "published", page: { ...page, subject: pickSubject(page.subject, `${name} ${body.category ?? ""}`) } });
  } catch (e) {
    return res.status(/429|503/.test(String(e?.message)) ? 429 : 502).json({ status: /429|503/.test(String(e?.message)) ? "busy" : "failed" });
  }
}
