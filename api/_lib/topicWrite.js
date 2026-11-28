import { neon } from "@neondatabase/serverless";
import { verifyNeonToken } from "./neonAdmin.js";

// Supabase executes and reviews AI generation. This Vercel route is the trusted
// persistence boundary and writes through Neon DATABASE_URL, never a browser JWT.
const AI_URL = "https://rcntjfzivtnijnkliouc.supabase.co/functions/v1/ompath-ai";
const AI_PUBLISHABLE_KEY = "sb_publishable_HdlAHkp2wXjRCYqWLnPckw_dOUcjEVP";
const hits = new Map();
const LIMIT = 30;
let db;

function getDb() {
  const url = String(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "").trim();
  if (!url) throw new Error("Neon DATABASE_URL is not configured");
  if (!db) db = neon(url);
  return db;
}

function slugOf(value) {
  return String(value || "").normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function asObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
  }
  return {};
}

function deepReady(deep) {
  return Boolean(deep?.checked) && (deep?.sections?.length || 0) >= 7
    && (deep?.vivas?.length || 0) >= 12 && (deep?.mcqs?.length || 0) >= 6
    && (deep?.cases?.length || 0) >= 2 && (deep?.facts?.length || 0) >= 6
    && (deep?.mistakes?.length || 0) >= 5 && (deep?.exam?.length || 0) >= 12;
}

export function bearer(req) {
  return String(req.headers["x-neon-authorization"] || req.headers.authorization || "")
    .replace(/^Bearer\\s+/i, "").trim();
}

async function invokeGateway(token, payload, timeoutMs = 90000) {
  if (!token) return { status: 401, data: { status: "login_required" } };
  try {
    const response = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: AI_PUBLISHABLE_KEY,
        "x-neon-authorization": token,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
  } catch (error) {
    console.error("[topic-write] Supabase AI gateway unavailable:", String(error?.message || error).slice(0, 180));
    return { status: 503, data: { status: "unavailable", reason: "ai_gateway_unavailable" } };
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const token = bearer(req);

  if (req.method === "GET" && new URL(req.url, "https://ompathstudy.com").searchParams.get("health") === "1") {
    const result = await invokeGateway(token, { task: "health" }, 30000);
    return res.status(result.status).json(result.data);
  }

  if (req.method !== "POST") return res.status(405).json({ status: "invalid" });
  if (!token || !(await verifyNeonToken(token))) return res.status(401).json({ status: "login_required" });

  let body = req.body && typeof req.body === "object" ? req.body : {};
  if (typeof req.body === "string") {
    try { body = JSON.parse(req.body || "{}"); }
    catch { return res.status(400).json({ status: "invalid_json" }); }
  }

  const deep = body.mode === "deep";
  const requestedName = String(body.name ?? "").trim();
  if ((!deep && (requestedName.length < 3 || requestedName.length > 100))
    || (deep && requestedName && (requestedName.length < 3 || requestedName.length > 100))) {
    return res.status(400).json({ status: "invalid" });
  }

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const mine = (hits.get(ip) || []).filter((t) => now - t < 3_600_000);
  if (mine.length >= LIMIT) return res.status(429).json({ status: "busy" });
  hits.set(ip, [...mine, now]);
  if (hits.size > 5000) hits.clear();

  try {
    const sql = getDb();

    if (deep) {
      const slug = String(body.slug || slugOf(requestedName)).trim().slice(0, 80);
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return res.status(400).json({ status: "invalid_slug" });
      const rows = await sql`SELECT slug, name, category, content, status
        FROM public.topic_pages WHERE slug = ${slug} LIMIT 1`;
      const existing = rows[0];
      if (!existing || existing.status !== "published") return res.status(404).json({ status: "topic_not_found" });

      const base = asObject(existing.content);
      if (deepReady(base.deep)) {
        return res.status(200).json({ status: "published", deep: base.deep, saved: true, slug, name: existing.name, existing: true });
      }

      const name = String(existing.name || requestedName).trim();
      const category = String(existing.category || body.category || "").slice(0, 60);
      const result = await invokeGateway(token, {
        task: "deep",
        name,
        category,
        base,
        past: (Array.isArray(body.past) ? body.past : []).map((x) => String(x).slice(0, 240)).slice(0, 12),
        slug,
      }, 90000);
      if (result.status !== 200) return res.status(result.status).json(result.data);
      if (result.data?.status === "published" && result.data?.saved === true) return res.status(200).json(result.data);

      const deepNotes = result.data?.deep;
      if (!deepReady(deepNotes) || JSON.stringify(deepNotes).length > 90000) {
        return res.status(422).json({ status: "held", slug, reason: "deep_note_validation_failed" });
      }

      const savedRows = await sql`SELECT public.save_topic_deep(
        ${slug}, ${name}, ${category}, ${JSON.stringify(base)}::jsonb, ${JSON.stringify(deepNotes)}::jsonb
      ) AS result`;
      const saved = savedRows[0]?.result;
      if (!saved?.ok) return res.status(502).json({ status: "failed", reason: saved?.reason || "persistence" });
      return res.status(200).json({
        status: "published", deep: deepNotes, saved: true, slug, name,
        existing: Boolean(saved.existing), quota: result.data?.quota,
      });
    }

    const name = requestedName;
    const slug = slugOf(name);
    if (!slug) return res.status(400).json({ status: "invalid_slug" });
    const category = String(body.category ?? "").slice(0, 60);
    const rows = await sql`SELECT slug, name, content, status
      FROM public.topic_pages WHERE slug = ${slug} LIMIT 1`;
    const existing = rows[0];
    if (existing?.status === "published" && existing.content) {
      return res.status(200).json({ status: "published", page: asObject(existing.content), saved: true, slug, name, existing: true });
    }

    const result = await invokeGateway(token, {
      task: "topic",
      name,
      category,
      context: String(body.context ?? "").slice(0, 3000),
      choices: body.choices && typeof body.choices === "object" ? body.choices : undefined,
    }, 90000);
    if (result.status !== 200) return res.status(result.status).json(result.data);
    if (result.data?.status === "published" && result.data?.saved === true) return res.status(200).json(result.data);

    const page = result.data?.page;
    if (!page?.medical || page.aiReview?.status !== "passed" || !page.aiReview?.model) {
      return res.status(422).json({ status: "held", reason: "independent_clinical_review_required" });
    }
    const savedRows = await sql`SELECT public.publish_topic_page_system(
      ${slug}, ${name}, ${category}, ${JSON.stringify(page)}::jsonb, ${String(page.model || "groq")}
    ) AS result`;
    const saved = savedRows[0]?.result;
    if (!saved?.ok) return res.status(502).json({ status: "failed", reason: saved?.reason || "persistence" });
    return res.status(200).json({
      status: "published", page, saved: true, slug, name,
      existing: Boolean(saved.existing), quota: result.data?.quota,
    });
  } catch (error) {
    console.error("[topic-write] Neon persistence failed:", String(error?.message || error).slice(0, 220));
    return res.status(503).json({ status: "unavailable", reason: "neon_persistence_unavailable" });
  }
}
