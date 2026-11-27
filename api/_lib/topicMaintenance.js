import { neon } from "@neondatabase/serverless";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { generateReviewedTopicPage } from "../../supabase/functions/_shared/topicAi.js";

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

    if (task === "generate-publish") {
      const name = String(body.name || "").trim();
      const category = String(body.category || "").slice(0, 60);
      const context = String(body.context || "").slice(0, 5000);
      if (name.length < 4 || name.length > 80 || name.includes("<") || name.includes(">")) {
        return res.status(400).json({ error: "Invalid topic name." });
      }
      const env = {
        GROQ_API_KEYS: String(process.env.GROQ_API_KEYS || ""),
        GEMINI_API_KEYS: String(process.env.GEMINI_API_KEYS || ""),
      };
      if (!env.GROQ_API_KEYS.trim() || !env.GEMINI_API_KEYS.trim()) {
        return res.status(503).json({ error: "Groq and Gemini keys are not configured in Cloudflare." });
      }
      const generated = await generateReviewedTopicPage({ name, category, context }, { env });
      const page = generated?.page;
      if (!page || page.medical !== true) return res.status(422).json({ ok: false, reason: "not_medical" });
      if (page.aiReview?.status !== "passed" || !String(page.aiReview?.model || "").trim()
          || !Array.isArray(page.sections) || page.sections.length < 3
          || !Array.isArray(page.exam) || page.exam.length < 8
          || String(page.summary || "").length < 100 || JSON.stringify(page).length > 60000) {
        return res.status(422).json({ ok: false, reason: "review_or_structure" });
      }
      const requestedSlug = String(body.slug || "");
      const slug = requestedSlug || name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/g, "");
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return res.status(400).json({ error: "Invalid topic slug." });
      const rows = await getDb()`SELECT public.publish_topic_page(
        ${slug}, ${name}, ${category}, ${JSON.stringify(page)}::jsonb, ${page.model || "groq"}
      ) AS result`;
      const result = rows[0]?.result || { ok: false, reason: "empty_result" };
      if (!result.ok) return res.status(result.reason === "busy" ? 429 : 422).json(result);
      return res.status(200).json({ ...result, slug, name, page });
    }

    if (task === "publish") {
      const slug = String(body.slug || "");
      const name = String(body.name || "").trim();
      const category = String(body.category || "").slice(0, 60);
      const page = body.page;
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || !name || name.length > 80) {
        return res.status(400).json({ error: "Invalid topic identity." });
      }
      if (!page || typeof page !== "object" || page.medical !== true || page.aiReview?.status !== "passed"
          || !String(page.aiReview?.model || "").trim() || !Array.isArray(page.sections) || page.sections.length < 3
          || !Array.isArray(page.exam) || page.exam.length < 8 || String(page.summary || "").length < 100
          || JSON.stringify(page).length > 60000
          || (/https?:|javascript:|data:text/i.test(JSON.stringify(page)) || JSON.stringify(page).toLowerCase().includes("www.") || /<[a-z/!]/i.test(JSON.stringify(page)) || /(?:onerror|onload) *=/i.test(JSON.stringify(page)))) {
        return res.status(400).json({ error: "Topic did not pass the publication safeguards." });
      }
      const rows = await getDb()`SELECT public.publish_topic_page(
        ${slug}, ${name}, ${category}, ${JSON.stringify(page)}::jsonb, ${page.model || "groq"}
      ) AS result`;
      const result = rows[0]?.result || { ok: false, reason: "empty_result" };
      return res.status(result.ok ? 200 : result.reason === "busy" ? 429 : 422).json(result);
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

    if (task === "review-save") {
      const slug = String(body.slug || "");
      const page = body.page;
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return res.status(400).json({ error: "Invalid topic slug." });
      if (!page || typeof page !== "object" || page.medical !== true || page.aiReview?.status !== "passed"
          || !Array.isArray(page.sections) || page.sections.length < 9 || !Array.isArray(page.exam) || page.exam.length < 8
          || JSON.stringify(page).length > 60000) {
        return res.status(400).json({ error: "Topic review payload did not pass the required structure checks." });
      }
      const saved = await getDb()`UPDATE public.topic_pages
        SET content = ${JSON.stringify(page)}::jsonb,
            model = ${page.model || "groq"},
            reviewed = false,
            updated_at = now(),
            generator_model = ${page.model || "groq"},
            ai_review_status = 'passed',
            ai_review_model = ${String(body.reviewModel || page.aiReview.model || "gemini")},
            ai_reviewed_at = now(),
            ai_review_fix_rounds = ${Number(body.reviewRounds) || 0}
        WHERE slug = ${slug} AND status = 'published' AND updated_at = ${body.updatedAt}
        RETURNING slug`;
      return res.status(200).json({ status: saved.length ? "reviewed" : "conflict", slug });
    }

    if (task === "deep-save") {
      const slug = String(body.slug || "");
      const deep = body.deep;
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return res.status(400).json({ error: "Invalid topic slug." });
      if (!deepReady(deep) || JSON.stringify(deep).length > 90000
          || /https?:|www\.|<[a-z/!]|javascript:|onerror\s*=|data:text/i.test(JSON.stringify(deep))) {
        return res.status(400).json({ error: "Deep-note payload did not pass the required structure checks." });
      }
      const rows = await getDb()`SELECT content FROM public.topic_pages
        WHERE slug = ${slug} AND status = 'published' AND updated_at = ${body.updatedAt} LIMIT 1`;
      const row = rows[0];
      if (!row) return res.status(200).json({ status: "conflict", slug });
      if (deepReady(row.content?.deep)) return res.status(200).json({ status: "existing", slug });
      const content = { ...(row.content || {}), deep };
      const saved = await getDb()`UPDATE public.topic_pages
        SET content = ${JSON.stringify(content)}::jsonb, updated_at = now()
        WHERE slug = ${slug} AND status = 'published' AND updated_at = ${body.updatedAt}
        RETURNING slug`;
      return res.status(200).json({ status: saved.length ? "deep_saved" : "conflict", slug });
    }

    return res.status(400).json({ error: "Unknown maintenance task." });
  } catch (error) {
    console.error("[topic-maintenance]", error instanceof Error ? error.message : String(error));
    return res.status(502).json({ error: "Topic maintenance could not complete this task." });
  }
}
