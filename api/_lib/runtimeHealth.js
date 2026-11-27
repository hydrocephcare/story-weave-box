import { isAdmin } from "./adminAgent.js";
import { getPolishSql, hasPolishWriteKey } from "./neonPolishStore.js";
import { verifyNeonToken } from "./neonAdmin.js";
import { askGeminiModel, askGroqModel } from "../../supabase/functions/_shared/topicAi.js";

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

  const result = {
    unportedFunctions: { ok: true, ready: true, functions: [] },
  };
  const deepAI = new URL(req.url, "https://www.ompathstudy.com").searchParams.get("deep") === "1";
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
      to_regprocedure('public.is_mku_student(uuid)') IS NOT NULL AS mku_student_rpc,
      to_regprocedure('public.ensure_neon_user(uuid,text)') IS NOT NULL AS ensure_neon_user_rpc`);
    return rows[0] || {};
  });

  result.userIdentity = await check("user-identity", async () => {
    const identity = await verifyNeonToken(bearer(req));
    if (!identity) return { ready: false, reason: "Neon Auth token could not be verified." };
    const sql = getPolishSql();
    const account = await sql.query('SELECT email,"emailVerified" FROM neon_auth."user" WHERE id=$1 LIMIT 1', [identity.id]);
    const email = String(identity.email || account[0]?.email || "").trim().toLowerCase();
    if (!email || account[0]?.emailVerified !== true) return { ready: false, reason: "Verified Neon Auth email is required." };
    const rows = await sql.query("SELECT public.ensure_neon_user($1,$2) AS result", [identity.id, email]);
    const result = rows[0]?.result || {};
    return { ready: true, migratedRows: Number(result.migrated_rows || 0), skipped: Array.isArray(result.skipped) ? result.skipped.length : 0 };
  });

  result.searchDataApi = await check("search-data-api", async () => {
    const base = String(process.env.NEON_DATA_API_URL || process.env.VITE_NEON_DATA_API_URL || DEFAULT_DATA_API).replace(/\/+$/, "");
    const tables = ["articles", "mcq_sets", "flashcard_sets", "units", "syllabus_topics", "search_aliases", "stories"];
    const checks = await Promise.all(tables.map(async (table) => {
      const response = await fetch(base + "/" + table + "?select=id&limit=1", {
        headers: { Authorization: "Bearer " + bearer(req), Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      return { table, ok: response.ok, status: response.status };
    }));
    return { connected: checks.every((item) => item.ok), tables: checks };
  });

  result.mainSitemap = await check("main-sitemap", async () => {
    const response = await fetch("https://www.ompathstudy.com/sitemap.xml", { signal: AbortSignal.timeout(10000) });
    const xml = await response.text();
    return { ready: response.ok && response.headers.get("content-type")?.includes("xml") === true && /sitemapindex|urlset/.test(xml), status: response.status };
  });

  result.topicsSitemap = await check("topics-sitemap", async () => {
    const response = await fetch("https://www.ompathstudy.com/topics-sitemap.xml", { signal: AbortSignal.timeout(10000) });
    return { ready: response.ok && response.headers.get("x-ompath-topics-sitemap") === "neon-v1", status: response.status, migrated: response.headers.get("x-ompath-topics-sitemap") === "neon-v1" };
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

  result.entitlements = await check("entitlements", async () => {
    // Health checks must never consume a student's feature quota. Verify the
    // read-only role RPC instead of calling consume_feature().
    const identity = await verifyNeonToken(bearer(req));
    if (!identity) return { ready: false, reason: "Verified Neon Auth identity unavailable." };
    const base = String(process.env.NEON_DATA_API_URL || process.env.VITE_NEON_DATA_API_URL || DEFAULT_DATA_API).replace(/\/+$/, "");
    const response = await fetch(base + "/rpc/has_role", {
      method: "POST",
      headers: { Authorization: "Bearer " + bearer(req), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ _user_id: identity.id, _role: "admin" }),
      signal: AbortSignal.timeout(10000),
    });
    const allowed = response.ok ? await response.json().catch(() => false) : false;
    return { ready: response.ok && allowed === true, status: response.status };
  });

  result.groq = await check("groq", async () => {
    const providerKeys = keys(process.env.GROQ_API_KEYS, process.env.GROQ_API_KEY,
      ...Array.from({ length: 20 }, (_, i) => process.env["GROQ_API_KEY_" + (i + 2)]));
    if (!providerKeys.length) return { configured: false, reachable: false, configuredKeyCount: 0 };
    const checks = await Promise.all(providerKeys.map(async (key) => {
      const response = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: "Bearer " + key, Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      return { ok: response.ok, status: response.status };
    }));
    return { configured: true, reachable: checks.some((item) => item.ok),
      configuredKeyCount: checks.length, healthyKeyCount: checks.filter((item) => item.ok).length,
      statuses: checks.map((item) => item.status) };
  });

  result.gemini = await check("gemini", async () => {
    const providerKeys = keys(process.env.GEMINI_API_KEYS, process.env.GEMINI_API_KEY,
      ...Array.from({ length: 20 }, (_, i) => process.env["GEMINI_API_KEY_" + (i + 2)]));
    if (!providerKeys.length) return { configured: false, reachable: false, configuredKeyCount: 0 };
    const checks = await Promise.all(providerKeys.map(async (key) => {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", {
        headers: { "x-goog-api-key": key, Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      const data = await response.json().catch(() => ({}));
      const modelNames = Array.isArray(data.models) ? data.models.map((model) => String(model.name || "").replace(/^models\\//, "")) : [];
      return { ok: response.ok, status: response.status, models: modelNames.length,
        hasCurrentFlash: modelNames.includes("gemini-3.8-flash"),
        hasCurrentFlashLite: modelNames.includes("gemini-3.5-flash-lite") };
    }));
    return { configured: true, reachable: checks.some((item) => item.ok),
      configuredKeyCount: checks.length, healthyKeyCount: checks.filter((item) => item.ok).length,
      statuses: checks.map((item) => item.status),
      currentFlashAvailable: checks.some((item) => item.ok && item.hasCurrentFlash),
      currentFlashLiteAvailable: checks.some((item) => item.ok && item.hasCurrentFlashLite) };
  });

  if (deepAI) {
    result.groqGeneration = await check("groq-generation", async () => {
      const out = await askGroqModel("Reply with the single word OK.", { env: process.env, timeoutMs: 15000, maxTokens: 8 });
      return { ready: Boolean(out?.text?.trim()), model: out?.model || null };
    });
    result.geminiGeneration = await check("gemini-generation", async () => {
      const out = await askGeminiModel("Reply with the single word OK.", { env: process.env, timeoutMs: 15000, maxTokens: 8 });
      return { ready: Boolean(out?.text?.trim()), model: out?.model || null };
    });
  }

  result.onekitty = await check("onekitty", async () => {
    const authConfigured = Boolean(process.env.ONEKITTY_AUTH_CODE && Number(process.env.ONEKITTY_KITTY_ID) > 0);
    const developerConfigured = Boolean(process.env.ONEKITTY_DEVELOPER_API_KEY);
    return { configured: authConfigured, developerApiConfigured: developerConfigured, ready: authConfigured && developerConfigured };
  });

  result.rlsRoleCompatibility = await check("rls-role-compatibility", async () => {
    const rows = await getPolishSql().query(`SELECT
      count(*) FILTER (WHERE roles @> ARRAY['supabase_authenticated_legacy']::name[]
        AND NOT roles @> ARRAY['authenticated']::name[])::int AS authenticated_policies_missing,
      count(*) FILTER (WHERE roles @> ARRAY['supabase_anon_legacy']::name[]
        AND NOT roles @> ARRAY['anonymous']::name[])::int AS anonymous_policies_missing
      FROM pg_policies WHERE schemaname='public'`);
    const row = rows[0] || {};
    const authenticatedMissing = Number(row.authenticated_policies_missing || 0);
    const anonymousMissing = Number(row.anonymous_policies_missing || 0);
    return { ready: authenticatedMissing === 0 && anonymousMissing === 0,
      authenticatedPoliciesMissing: authenticatedMissing, anonymousPoliciesMissing: anonymousMissing };
  });

  result.googleDrive = await check("google-drive", async () => {
    const rows = await getPolishSql().query(`SELECT
      to_regclass('public.study_resources') IS NOT NULL AS study_resources,
      to_regclass('public.google_drive_connections') IS NOT NULL AS connections,
      to_regclass('public.google_drive_oauth_states') IS NOT NULL AS oauth_states,
      to_regclass('public.google_drive_import_jobs') IS NOT NULL AS import_jobs,
      to_regclass('public.google_drive_import_items') IS NOT NULL AS import_items`);
    const schema = rows[0] || {};
    const credentialsConfigured = Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET);
    return { ready: Object.values(schema).every((value) => value === true) && credentialsConfigured,
      credentialsConfigured, schema,
      redirectUri: process.env.GOOGLE_DRIVE_REDIRECT_URI || "https://ompathstudy.com/api/google-drive-oauth" };
  });

  result.contestManagement = await check("contest-management", async () => {
    const rows = await getPolishSql().query(`SELECT
      to_regclass('public.contests') IS NOT NULL AS contests,
      to_regclass('public.contest_rounds') IS NOT NULL AS rounds,
      to_regclass('public.contest_questions') IS NOT NULL AS questions,
      to_regclass('public.contest_registrations') IS NOT NULL AS registrations,
      to_regclass('public.contest_attempts') IS NOT NULL AS attempts,
      to_regclass('private.contest_answer_keys') IS NOT NULL AS answer_keys,
      to_regprocedure('public.admin_replace_contest_questions(uuid,jsonb)') IS NOT NULL AS question_import_rpc,
      to_regprocedure('public.score_contest_attempt(uuid)') IS NOT NULL AS scoring_rpc`);
    const schema = rows[0] || {};
    const ready = Object.values(schema).every((value) => value === true) && result.rlsRoleCompatibility?.ready === true;
    return { ready, schema, handler: "cloudflare-pages-neon" };
  });

  result.storiesSitemap = await check("stories-sitemap", async () => {
    const response = await fetch("https://stories.ompathstudy.com/stories-sitemap.xml", { signal: AbortSignal.timeout(10000) });
    return { ready: response.ok && response.headers.get("x-ompath-stories-sitemap") === "neon-v1", status: response.status, migrated: response.headers.get("x-ompath-stories-sitemap") === "neon-v1" };
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
