import { neon } from "@neondatabase/serverless";
import { verifyNeonToken } from "./neonAdmin.js";

const SECRET_HEADER = "x-neon-db-gateway-secret";
const bearer = (req) => String(req.headers?.["x-neon-authorization"] || req.headers?.authorization || "")
  .replace(/^Bearer\s+/i, "").trim();

function sameSecret(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function safeSlug(value) {
  const slug = String(value || "");
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 80 ? slug : "";
}

function safePage(page) {
  if (!page || typeof page !== "object" || Array.isArray(page)) return false;
  const text = JSON.stringify(page);
  return page.medical === true
    && page.aiReview?.status === "passed"
    && Boolean(String(page.aiReview?.model || "").trim())
    && Array.isArray(page.sections) && page.sections.length >= 3 && page.sections.length <= 16
    && Array.isArray(page.exam) && page.exam.length >= 8
    && String(page.summary || "").trim().length >= 100
    && text.length <= 60000
    && !/(https?:|www\.|<[a-z/!]|javascript:|onerror\s*=|data:text)/i.test(text);
}

function deepReady(deep) {
  if (!deep || typeof deep !== "object" || Array.isArray(deep)) return false;
  const text = JSON.stringify(deep);
  return Boolean(deep.checked)
    && Array.isArray(deep.sections) && deep.sections.length >= 7 && deep.sections.length <= 14
    && Array.isArray(deep.vivas) && deep.vivas.length >= 12
    && Array.isArray(deep.mcqs) && deep.mcqs.length >= 6
    && Array.isArray(deep.cases) && deep.cases.length >= 2
    && Array.isArray(deep.facts) && deep.facts.length >= 6
    && Array.isArray(deep.mistakes) && deep.mistakes.length >= 5
    && Array.isArray(deep.exam) && deep.exam.length >= 12
    && text.length <= 90000
    && !/(https?:|www\.|<[a-z/!]|javascript:|onerror\s*=|data:text)/i.test(text);
}

export default async function topicWriteDb(req, res) {
  if (req.method !== "POST") {
    res.setHeader?.("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const secret = String(process.env.NEON_DB_GATEWAY_SECRET || "");
  if (secret.length < 32) return res.status(503).json({ error: "Neon write gateway is not configured." });
  const supplied = String(req.headers?.[SECRET_HEADER] || "");
  if (!sameSecret(supplied, secret)) return res.status(403).json({ error: "Forbidden." });

  const token = bearer(req);
  const user = await verifyNeonToken(token);
  if (!user) return res.status(401).json({ error: "A valid Neon Auth session is required." });

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!databaseUrl) return res.status(503).json({ error: "Neon database connection is not configured." });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const task = String(body.task || "");

  try {
    if (task === "publish_topic") {
      const slug = safeSlug(body.slug);
      const name = String(body.name || "").trim();
      const category = String(body.category || "").slice(0, 60);
      const page = body.page;
      if (!slug || name.length < 3 || name.length > 80 || /[<>]/.test(name) || !safePage(page)) {
        return res.status(400).json({ error: "Topic publication payload did not pass validation." });
      }
      const sql = neon(databaseUrl);
      const rows = await sql`SELECT public.publish_topic_page_system(
        ${slug}, ${name}, ${category}, ${JSON.stringify(page)}::jsonb, ${String(page.model || "groq")}
      ) AS result`;
      const result = rows[0]?.result || { ok: false, reason: "empty_result" };
      if (!result.ok) return res.status(result.reason === "busy" ? 429 : 422).json(result);
      return res.status(200).json({ ...result, slug, name });
    }

    if (task === "save_deep") {
      const slug = safeSlug(body.slug);
      const name = String(body.name || "").trim().slice(0, 80);
      const category = String(body.category || "").slice(0, 60);
      const deep = body.deep;
      if (!slug || name.length < 3 || !deepReady(deep)) {
        return res.status(400).json({ error: "Deep-note payload did not pass validation." });
      }
      const sql = neon(databaseUrl);
      const rows = await sql`SELECT public.save_topic_deep(
        ${slug}, ${name}, ${category}, NULL::jsonb, ${JSON.stringify(deep)}::jsonb
      ) AS result`;
      const result = rows[0]?.result || { ok: false, reason: "empty_result" };
      if (!result.ok) return res.status(result.reason === "busy" ? 429 : 422).json(result);
      return res.status(200).json({ ...result, slug, name });
    }

    return res.status(400).json({ error: "Unknown topic write task." });
  } catch (error) {
    console.error("[topic-write-db] Neon persistence failed:", String(error?.message || error).slice(0, 220));
    return res.status(502).json({ error: "Neon persistence failed." });
  }
}
