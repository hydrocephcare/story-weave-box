import { isAdmin } from "./adminAgent.js";
import { getPolishSql, hasPolishWriteKey } from "./neonPolishStore.js";

const DEFAULT_JWKS = "https://ep-dry-haze-benks3ew.neonauth.c-9.us-east-2.aws.neon.tech/neondb/auth/.well-known/jwks.json";
const DEFAULT_DATA_API = "https://ep-dry-haze-benks3ew.apirest.c-9.us-east-2.aws.neon.tech/neondb/rest/v1";
const bearer = (req) => String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
const keys = (value) => [...new Set(String(value || "").split(/[\s,]+/).map((x) => x.trim()).filter(Boolean))];

async function check(name, fn) {
  try { return { ok: true, ...(await fn()) }; }
  catch (error) {
    console.error("[runtime-health:" + name + "]", error instanceof Error ? error.message : String(error));
    return { ok: false, error: "Check failed; inspect server logs." };
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "GET only." });
  if (!(await isAdmin(bearer(req)))) return res.status(403).json({ error: "Administrator access required." });

  const result = {};
  result.neonDatabase = await check("neon-database", async () => {
    const rows = await getPolishSql().query("SELECT 1 AS ok");
    return { connected: rows[0]?.ok === 1 };
  });

  result.schema = await check("schema", async () => {
    const rows = await getPolishSql().query(`SELECT
      to_regclass('public.articles') IS NOT NULL AS articles,
      to_regclass('public.blog_polish') IS NOT NULL AS blog_polish,
      to_regclass('public.topic_pages') IS NOT NULL AS topic_pages,
      to_regclass('public.payments') IS NOT NULL AS payments,
      to_regclass('public.access_grants') IS NOT NULL AS access_grants,
      to_regclass('public.stories') IS NOT NULL AS stories,
      to_regprocedure('public.publish_topic_page(text,text,text,jsonb,text)') IS NOT NULL AS topic_publish_rpc,
      to_regprocedure('public.save_topic_deep(text,text,text,jsonb,jsonb)') IS NOT NULL AS topic_deep_rpc,
      to_regprocedure('public.consume_feature(text,integer)') IS NOT NULL AS entitlement_rpc,
      to_regprocedure('public.is_mku_student(uuid)') IS NOT NULL AS mku_student_rpc`);
    return rows[0] || {};
  });

  result.searchDataApi = await check("search-data-api", async () => {
    const base = String(process.env.NEON_DATA_API_URL || process.env.VITE_NEON_DATA_API_URL || DEFAULT_DATA_API).replace(/\/+$/, "");
    const response = await fetch(base + "/articles?select=id&limit=1", {
      headers: { Authorization: "Bearer " + bearer(req), Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    return { connected: response.ok, status: response.status };
  });

  result.mainSitemap = await check("main-sitemap", async () => {
    const response = await fetch("https://www.ompathstudy.com/sitemap.xml", { signal: AbortSignal.timeout(10000) });
    const xml = await response.text();
    return { ready: response.ok && response.headers.get("content-type")?.includes("xml") === true && /sitemapindex|urlset/.test(xml), status: response.status };
  });

  result.storiesSitemap = await check("stories-sitemap", async () => {
    const response = await fetch("https://stories.ompathstudy.com/stories-sitemap.xml", { signal: AbortSignal.timeout(10000) });
    const xml = await response.text();
    return { ready: response.ok && response.headers.get("content-type")?.includes("xml") === true && xml.includes("<urlset"), status: response.status };
  });

  result.storiesCrawlerMetadata = await check("stories-crawler-metadata", async () => {
    const rows = await getPolishSql().query(`SELECT slug FROM public.stories
      WHERE published=true AND deleted_at IS NULL AND password_protected=false
        AND (scheduled_at IS NULL OR scheduled_at <= now()) AND slug IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`);
    const slug = String(rows[0]?.slug || "");
    if (!slug) return { ready: false, reason: "No public story slug found." };
    const response = await fetch("https://stories.ompathstudy.com/stories/" + encodeURIComponent(slug), {
      headers: { "user-agent": "Googlebot" },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    const html = await response.text();
    return { ready: response.ok && html.includes('property="og:title"') && html.includes('rel="canonical"') && !html.includes('name="robots" content="noindex'), status: response.status };
  });

  result.crawlerMetadata = await check("crawler-metadata", async () => {
    const rows = await getPolishSql().query(`SELECT slug FROM public.articles
      WHERE published=true AND deleted_at IS NULL AND password_protected=false
        AND (scheduled_at IS NULL OR scheduled_at <= now()) AND slug IS NOT NULL
      ORDER BY updated_at DESC LIMIT 1`);
    const slug = String(rows[0]?.slug || "");
    if (!slug) return { ready: false, reason: "No public article slug found." };
    const response = await fetch("https://www.ompathstudy.com/blog/" + encodeURIComponent(slug), {
      headers: { "user-agent": "Googlebot" },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    const html = await response.text();
    return { ready: response.ok && html.includes('property="og:title"') && html.includes('rel="canonical"') && !html.includes('name="robots" content="noindex'), status: response.status };
  });

  result.noteCard = await check("note-card", async () => {
    const response = await fetch("https://www.ompathstudy.com/api/note-card?title=Ompath%20Study%20Health%20Check&kind=System", {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    const type = response.headers.get("content-type") || "";
    const bytes = response.ok && type.includes("image/png") ? new Uint8Array(await response.arrayBuffer()) : new Uint8Array();
    const png = bytes.length > 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    return { ready: response.status === 200 && png, status: response.status, png };
  });

  result.authJwks = await check("auth-jwks", async () => {
    const response = await fetch(process.env.NEON_AUTH_JWKS_URL || DEFAULT_JWKS, { signal: AbortSignal.timeout(8000) });
    const data = await response.json().catch(() => ({}));
    return { reachable: response.ok && Array.isArray(data.keys) && data.keys.length > 0, status: response.status };
  });

  result.mkuStudentAccess = await check("mku-student-access", async () => {
    const base = String(process.env.NEON_DATA_API_URL || process.env.VITE_NEON_DATA_API_URL || DEFAULT_DATA_API).replace(/\/+$/, "");
    const response = await fetch(base + "/rpc/is_mku_student", {
      method: "POST",
      headers: { Authorization: "Bearer " + bearer(req), "Content-Type": "application/json", Accept: "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(10000),
    });
    const allowed = response.ok ? await response.json().catch(() => false) : false;
    return { endpointReachable: response.ok, currentAdminAllowed: allowed === true, status: response.status };
  });

  result.groq = await check("groq", async () => {
    const key = keys(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY)[0];
    if (!key) return { configured: false, reachable: false };
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: "Bearer " + key, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json().catch(() => ({}));
    return { configured: true, reachable: response.ok, status: response.status, models: Array.isArray(data.data) ? data.data.length : 0 };
  });

  result.gemini = await check("gemini", async () => {
    const key = keys(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY)[0];
    if (!key) return { configured: false, reachable: false };
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", {
      headers: { "x-goog-api-key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json().catch(() => ({}));
    return { configured: true, reachable: response.ok, status: response.status, models: Array.isArray(data.models) ? data.models.length : 0 };
  });

  result.paystackWebhook = await check("paystack-webhook", async () => {
    const response = await fetch("https://www.ompathstudy.com/api/paystack-webhook", { signal: AbortSignal.timeout(10000) });
    const data = await response.json().catch(() => ({}));
    return { ready: response.ok && data.ready === true, status: response.status };
  });

  result.paystack = await check("paystack", async () => {
    const key = String(process.env.PAYSTACK_SECRET_KEY || "");
    if (!key) return { configured: false, reachable: false };
    const response = await fetch("https://api.paystack.co/balance", {
      headers: { Authorization: "Bearer " + key, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    return { configured: true, reachable: response.ok, status: response.status };
  });

  result.resend = await check("resend", async () => {
    const key = String(process.env.RESEND_API_KEY || "");
    if (!key) return { configured: false, reachable: false };
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: "Bearer " + key, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    return { configured: true, reachable: response.ok, status: response.status };
  });

  result.polish = await check("polish", async () => ({
    databaseSecretMatchesRuntime: await hasPolishWriteKey(),
    aiKeysConfigured: Boolean(keys(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY).length && keys(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY).length),
  }));

  result.payments = await check("payments", async () => {
    const rows = await getPolishSql().query("SELECT key,value FROM public.app_settings WHERE key IN ('paystack_enabled','access_plans')");
    const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    let plans = [];
    try { plans = JSON.parse(String(settings.access_plans || "[]")); } catch {}
    return { enabled: String(settings.paystack_enabled || "").toLowerCase() === "true", plans: (Array.isArray(plans) ? plans : []).map((p) => ({ id: p.id, price: p.price, days: p.days })) };
  });

  result.topics = await check("topics", async () => {
    const rows = await getPolishSql().query("SELECT count(*)::int AS published FROM public.topic_pages WHERE status='published' AND ai_review_status='passed'");
    return { publishRpcAvailable: result.schema?.topic_publish_rpc === true, reviewedPublished: Number(rows[0]?.published || 0) };
  });

  return res.status(200).json({ checkedAt: new Date().toISOString(), checks: result });
}
