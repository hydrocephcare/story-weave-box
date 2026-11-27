import { neon } from "@neondatabase/serverless";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { generateReviewedTopicPage } from "../../supabase/functions/_shared/topicAi.js";
import { generateCheckedDeep } from "../../supabase/functions/_shared/contentCheck.js";

export const config = { maxDuration: 60 };

const AUDIENCE = "ompathstudy-topic-maintenance";
const REPOSITORY = "hydrocephcare/story-weave-box";
const WORKFLOW_REF = "hydrocephcare/story-weave-box/.github/workflows/topics-daily.yml@refs/heads/main";
const jwks = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
let database;
const getDb = () => {
  if (!databaseUrl) throw new Error("Server-side Neon DATABASE_URL is not configured.");
  database ||= neon(databaseUrl);
  return database;
};

const TABLES = {
  articles: {
    columns: "id,title,slug,category,content,created_at,updated_at",
    where: "published = true AND deleted_at IS NULL",
    order: "created_at DESC",
  },
  mcq_sets: {
    columns: "id,title,slug,category,questions,created_at,updated_at",
    where: "published = true AND deleted_at IS NULL",
    order: "created_at DESC",
  },
  essays: {
    columns: "id,title,slug,category,short_answer_questions,long_answer_questions,created_at,updated_at",
    where: "published = true AND deleted_at IS NULL",
    order: "created_at DESC",
  },
  topic_pages: {
    columns: "slug,name,category,content,reviewed,updated_at,ai_review_status",
    where: "status = 'published'",
    order: "updated_at DESC",
  },
};

async function verifyWorkflow(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: "https://token.actions.githubusercontent.com",
      audience: AUDIENCE,
    });
    return payload.repository === REPOSITORY
      && payload.ref === "refs/heads/main"
      && payload.workflow_ref === WORKFLOW_REF
      && ["push", "schedule", "workflow_dispatch"].includes(String(payload.event_name));
  } catch {
    return false;
  }
}

function deepReady(deep) {
  return Boolean(deep?.checked) && (deep?.sections?.length || 0) >= 7
    && (deep?.vivas?.length || 0) >= 12 && (deep?.mcqs?.length || 0) >= 6
    && (deep?.cases?.length || 0) >= 2 && (deep?.facts?.length || 0) >= 6
    && (deep?.mistakes?.length || 0) >= 5 && (deep?.exam?.length || 0) >= 12;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!(await verifyWorkflow(req))) return res.status(401).json({ error: "A valid Ompath topic-maintenance workflow token is required." });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const task = String(body.task || "");

  try {
    if (task === "health") {
      const rows = await getDb()`SELECT count(*)::int AS count FROM public.topic_pages WHERE status = 'published'`;
      return res.status(200).json({ ok: true, publishedTopics: Number(rows[0]?.count || 0) });
    }

    if (task === "corpus") {
      const table = String(body.table || "");
      const config = TABLES[table];
      if (!config) return res.status(400).json({ error: "Unsupported corpus table." });
      const limit = Math.max(1, Math.min(100, Number(body.limit) || 50));
      const offset = Math.max(0, Math.min(20000, Number(body.offset) || 0));
      const rows = await getDb().query(
        `SELECT ${config.columns} FROM public.${table} WHERE ${config.where} ORDER BY ${config.order} LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      return res.status(200).json({ rows });
    }

    if (task === "review-one") {
      const slug = String(body.slug || "");
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return res.status(400).json({ error: "Invalid topic slug." });
      const rows = await getDb()`SELECT slug,name,category,content,updated_at FROM public.topic_pages WHERE slug = ${slug} AND status = 'published' LIMIT 1`;
      const row = rows[0];
      if (!row) return res.status(200).json({ status: "missing", slug });
      const groq = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
      const gemini = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
      if (!groq || !gemini) return res.status(503).json({ error: "Topic writer and independent reviewer are not configured." });
      const prior = row.content || {};
      const context = JSON.stringify({ priorSummary: prior.summary, priorSections: prior.sections, priorExam: prior.exam }).slice(0, 5000);
      const result = await generateReviewedTopicPage({
        name: row.name, category: row.category || "Medicine", context,
        choices: { level: "year4", setting: "tropical", depth: "full", angles: [] },
      }, { env: { GROQ_API_KEYS: groq, GEMINI_API_KEYS: gemini }, maxFixRounds: 1, timeoutMs: 45000, fetchImpl: fetch });
      if (!result.page?.medical || result.review?.status !== "passed") {
        return res.status(200).json({ status: "held", slug, reason: "independent_review_not_passed" });
      }
      const page = result.page;
      const saved = await getDb()`UPDATE public.topic_pages
        SET content = ${JSON.stringify(page)}::jsonb,
            model = ${page.model || "groq"},
            reviewed = false,
            updated_at = now(),
            generator_model = ${page.model || "groq"},
            ai_review_status = 'passed',
            ai_review_model = ${result.review.model},
            ai_reviewed_at = now(),
            ai_review_fix_rounds = ${result.review.rounds || 0}
        WHERE slug = ${slug} AND status = 'published' AND updated_at = ${row.updated_at}
        RETURNING slug`;
      return res.status(200).json({ status: saved.length ? "reviewed" : "conflict", slug });
    }

    if (task === "deep-one") {
      const slug = String(body.slug || "");
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return res.status(400).json({ error: "Invalid topic slug." });
      const rows = await getDb()`SELECT slug,name,category,content,updated_at FROM public.topic_pages WHERE slug = ${slug} AND status = 'published' LIMIT 1`;
      const row = rows[0];
      if (!row) return res.status(200).json({ status: "missing", slug });
      if (deepReady(row.content?.deep)) return res.status(200).json({ status: "existing", slug });
      const groq = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
      const gemini = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
      if (!groq || !gemini) return res.status(503).json({ error: "Topic writer and independent reviewer are not configured." });
      const deep = await generateCheckedDeep(
        { name: row.name, category: row.category || "Medicine", base: row.content || {}, past: [] },
        { GROQ_API_KEYS: groq, GEMINI_API_KEYS: gemini },
        fetch,
        45000,
      );
      const content = { ...(row.content || {}), deep };
      const saved = await getDb()`UPDATE public.topic_pages
        SET content = ${JSON.stringify(content)}::jsonb, updated_at = now()
        WHERE slug = ${slug} AND status = 'published' AND updated_at = ${row.updated_at}
        RETURNING slug`;
      return res.status(200).json({ status: saved.length ? "deep_saved" : "conflict", slug });
    }

    return res.status(400).json({ error: "Unknown maintenance task." });
  } catch (error) {
    console.error("[topic-maintenance]", error instanceof Error ? error.message : String(error));
    return res.status(502).json({ error: "Topic maintenance could not complete this task." });
  }
}
