// POST /api/topic-write { name, category, context }: Groq drafts a topic page and Gemini independently reviews it. The browser then saves it with the
// publish_topic_page database function. Provider keys remain server-side; Gemini review is mandatory before a page is returned.
import { neon } from "@neondatabase/serverless";
import { generateReviewedTopicPage, validName, slugOf } from "../../supabase/functions/_shared/topicAi.js";
import { consumeEntitlement } from "./entitlements.js";
import { generateCheckedDeep } from "../../supabase/functions/_shared/contentCheck.js";
import { pickSubject } from "../../supabase/functions/_shared/topicParts.js";

const hits = new Map(); // per visitor, per hour (best effort: a cold start forgets it)
const LIMIT = 30;
const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "";
let database;
function getDatabase() {
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured for topic persistence.");
  database ||= neon(databaseUrl);
  return database;
}
async function saveTopicPage({ name, category, page }) {
  const rows = await getDatabase()`select public.publish_topic_page(
    ${slugOf(name)}, ${name}, ${category || page.subject || ""}, ${JSON.stringify(page)}::jsonb, ${page.model || "groq"}
  ) as result`;
  return rows[0]?.result || { ok: false, reason: "empty_result" };
}
async function saveDeepNotes({ slug, name, category, base, deep }) {
  const rows = await getDatabase()`select public.save_topic_deep(
    ${slug}, ${name}, ${category || base.subject || ""}, ${JSON.stringify(base)}::jsonb, ${JSON.stringify(deep)}::jsonb
  ) as result`;
  return rows[0]?.result || { ok: false, reason: "empty_result" };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ status: "invalid" });
  const geminiEnv = {
    GEMINI_API_KEYS: process.env.GEMINI_API_KEYS || "",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
    GEMINI_API_KEY_2: process.env.GEMINI_API_KEY_2 || "",
    GEMINI_API_KEY_3: process.env.GEMINI_API_KEY_3 || "",
  };
  const hasGemini = Object.values(geminiEnv).some((value) => value.trim());
  const groq = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const mine = (hits.get(ip) || []).filter((t) => now - t < 3_600_000);
  if (mine.length >= LIMIT) return res.status(429).json({ status: "busy" });
  hits.set(ip, [...mine, now]);
  if (hits.size > 5000) hits.clear();

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const name = String(body.name ?? "").trim();
  if (!validName(name)) return res.status(400).json({ status: "invalid" });
  if (body.mode === "deep") {
    // Preserve the existing deep-notes generator and its original provider fallback.
    if (!groq.trim() && !hasGemini) return res.status(503).json({ status: "unavailable" });
    const quota = await consumeEntitlement(req, "ai_note_generation");
    if (!quota.allowed) return res.status(quota.status || 402).json({ status: "limit", upgrade_required: quota.status === 402, quota });
    try {
      const base = body.base && typeof body.base === "object" ? body.base : {};
      const past = (Array.isArray(body.past) ? body.past : []).map((x) => String(x).slice(0, 240)).slice(0, 12);
      const deep = await generateCheckedDeep({ name, category: String(body.category ?? "").slice(0, 60), base, past }, { GROQ_API_KEYS: groq, ...geminiEnv }, fetch, 50000);
      const slug = String(body.slug || slugOf(name));
      const saved = await saveDeepNotes({ slug, name, category: String(body.category ?? "").slice(0, 60), base, deep });
      if (!saved?.ok) return res.status(saved?.reason === "busy" ? 429 : 502).json({ status: saved?.reason === "busy" ? "busy" : "failed" });
      return res.status(200).json({ status: "published", deep, saved: true });
    } catch (e) {
      return res.status(/429|503/.test(String(e?.message)) ? 429 : 502).json({ status: /429|503/.test(String(e?.message)) ? "busy" : "failed", reason: String(e?.message ?? "").slice(0, 240) });
    }
  }
  if (!groq.trim() || !hasGemini) return res.status(503).json({ status: "unavailable" });
  const quota = await consumeEntitlement(req, "topic_page_generation");
  if (!quota.allowed) return res.status(quota.status || 402).json({ status: "limit", upgrade_required: quota.status === 402, quota });
  try {
    const input = { name, category: String(body.category ?? "").slice(0, 60), context: String(body.context ?? "").slice(0, 3000), choices: body.choices && typeof body.choices === "object" ? body.choices : undefined };
    const { page } = await generateReviewedTopicPage(input, { env: { GROQ_API_KEYS: groq, ...geminiEnv }, fetchImpl: fetch });
    if (!page.medical) return res.status(200).json({ status: "rejected" });
    const finalPage = { ...page, subject: pickSubject(page.subject, `${name} ${body.category ?? ""}`) };
    const saved = await saveTopicPage({ name, category: input.category, page: finalPage });
    if (!saved?.ok) return res.status(saved?.reason === "busy" ? 429 : 502).json({ status: saved?.reason === "busy" ? "busy" : "failed" });
    return res.status(200).json({ status: "published", page: finalPage, saved: true });
  } catch (e) {
    return res.status(/429|503/.test(String(e?.message)) ? 429 : 502).json({ status: /429|503/.test(String(e?.message)) ? "busy" : "failed" });
  }
}
