import { neon } from "@neondatabase/serverless";
import { timingSafeEqual } from "node:crypto";
import { verifyNeonToken } from "./neonAdmin.js";
import { deepNoteReady } from "./deepNoteReadiness.js";

function equalSecret(provided, expected) {
  const a = Buffer.from(String(provided || ""));
  const b = Buffer.from(String(expected || ""));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function bearer(req) {
  return String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
}

export default async function saveTopicDeep(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const expectedSecret = String(process.env.OMPATH_NEON_WRITE_SECRET || "");
  if (Buffer.byteLength(expectedSecret, "utf8") < 32) {
    return res.status(503).json({ status: "unavailable", reason: "proxy_secret_not_configured" });
  }
  if (!equalSecret(req.headers?.["x-ompath-neon-write-secret"], expectedSecret)) {
    return res.status(401).json({ status: "unauthorized" });
  }

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (req.method === "GET" && String(req.query?.health || "") === "1") {
    if (!databaseUrl) return res.status(503).json({ status: "unavailable", database: false });
    try {
      const sql = neon(databaseUrl);
      const rows = await sql`SELECT 1 AS ok, has_function_privilege(current_user, 'public.save_topic_deep(text,text,text,jsonb,jsonb)', 'EXECUTE') AS can_save`;
      const database = Number(rows?.[0]?.ok) === 1;
      const canSave = rows?.[0]?.can_save === true;
      if (!database || !canSave) {
        return res.status(503).json({ status: "unavailable", database, canSave });
      }
      return res.status(200).json({ status: "ok", database, canSave });
    } catch (error) {
      console.error("[save-topic-deep] health probe failed:", String(error?.code || error?.name || "database_error"));
      return res.status(502).json({ status: "unavailable", database: false });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ status: "invalid", reason: "method_not_allowed" });
  }

  const user = await verifyNeonToken(bearer(req));
  if (!user) return res.status(401).json({ status: "unauthorized", reason: "invalid_session" });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch {
    return res.status(400).json({ status: "invalid", reason: "invalid_json" });
  }
  const slug = String(body.slug || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const category = String(body.category || "").trim().slice(0, 60);
  const base = body.base && typeof body.base === "object" && !Array.isArray(body.base) ? body.base : {};
  const deep = body.deep && typeof body.deep === "object" && !Array.isArray(body.deep) ? body.deep : null;

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80 || name.length < 3 || name.length > 80 || !deep) {
    return res.status(400).json({ status: "invalid", reason: "invalid_payload" });
  }

  let payloadSize = 0;
  try {
    payloadSize = Buffer.byteLength(JSON.stringify({ base, deep }), "utf8");
  } catch {
    return res.status(400).json({ status: "invalid", reason: "invalid_payload" });
  }
  if (payloadSize > 150_000 || Buffer.byteLength(JSON.stringify(deep), "utf8") > 80_000) {
    return res.status(413).json({ status: "invalid", reason: "payload_too_large" });
  }
  if (!deepNoteReady(deep)) return res.status(400).json({ status: "invalid", reason: "incomplete_deep_notes" });
  if (!databaseUrl) return res.status(503).json({ status: "unavailable", reason: "database_not_configured" });

  try {
    const sql = neon(databaseUrl);
    const rows = await sql`SELECT public.save_topic_deep(
      ${slug}, ${name}, ${category},
      ${JSON.stringify(base)}::jsonb,
      ${JSON.stringify(deep)}::jsonb
    ) AS result`;
    const result = rows?.[0]?.result;
    if (!result || typeof result !== "object" || result.ok !== true) {
      return res.status(422).json({ status: "failed", reason: String(result?.reason || "persistence_rejected") });
    }
    return res.status(200).json({
      status: "saved",
      slug,
      saved: result.saved === true || result.existing === true,
      existing: result.existing === true,
    });
  } catch (error) {
    console.error("[save-topic-deep] Neon persistence failed:", String(error?.code || error?.name || "database_error"));
    return res.status(502).json({ status: "failed", reason: "persistence_failed" });
  }
}
