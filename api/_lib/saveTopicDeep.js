import { neon } from "@neondatabase/serverless";
import { timingSafeEqual } from "node:crypto";
import { verifyNeonToken } from "./neonAdmin.js";

const reply = (res, status, body) => {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
};

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
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ status: "invalid", reason: "method_not_allowed" });
  }

  const expectedSecret = String(process.env.OMPATH_NEON_WRITE_SECRET || "");
  if (!expectedSecret) {
    return res.status(503).json({ status: "unavailable", reason: "proxy_secret_not_configured" });
  }
  if (!equalSecret(req.headers?.["x-ompath-neon-write-secret"], expectedSecret)) {
    return res.status(401).json({ status: "unauthorized" });
  }

  const user = await verifyNeonToken(bearer(req));
  if (!user) return res.status(401).json({ status: "unauthorized", reason: "invalid_session" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const slug = String(body.slug || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const category = String(body.category || "").trim().slice(0, 60);
  const base = body.base && typeof body.base === "object" && !Array.isArray(body.base) ? body.base : {};
  const deep = body.deep && typeof body.deep === "object" && !Array.isArray(body.deep) ? body.deep : null;

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120 || name.length < 3 || name.length > 160 || !deep) {
    return res.status(400).json({ status: "invalid", reason: "invalid_payload" });
  }

  let payloadSize = 0;
  try {
    payloadSize = Buffer.byteLength(JSON.stringify({ base, deep }), "utf8");
  } catch {
    return res.status(400).json({ status: "invalid", reason: "invalid_payload" });
  }
  if (payloadSize > 1_500_000) {
    return res.status(413).json({ status: "invalid", reason: "payload_too_large" });
  }

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
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
