// Privileged Neon persistence for the Supabase AI gateway.
// This module is only called inside the Edge Function with NEON_DATABASE_URL;
// never expose the owner connection or these operations to browser JWTs.
export async function publishReviewedTopic(db, { slug, name, category, page }) {
  const rows = await db.query(
    "SELECT public.publish_topic_page_system($1, $2, $3, $4::jsonb, $5) AS result",
    [slug, name, category, JSON.stringify(page), page?.model || "groq"],
  );
  return rows?.[0]?.result || { ok: false, reason: "empty_result" };
}

export function deepReady(deep) {
  return Boolean(deep?.checked)
    && (deep?.sections?.length || 0) >= 7
    && (deep?.vivas?.length || 0) >= 12
    && (deep?.mcqs?.length || 0) >= 6
    && (deep?.cases?.length || 0) >= 2
    && (deep?.facts?.length || 0) >= 6
    && (deep?.mistakes?.length || 0) >= 5
    && (deep?.exam?.length || 0) >= 12;
}

export async function saveReviewedDeep(db, { slug, name, category, base, deep }) {
  if (!deepReady(deep)) return { ok: false, reason: "quality" };
  const rows = await db.query(
    "SELECT public.save_topic_deep($1, $2, $3, $4::jsonb, $5::jsonb) AS result",
    [slug, name, category, JSON.stringify(base || {}), JSON.stringify(deep)],
  );
  return rows?.[0]?.result || { ok: false, reason: "empty_result" };
}

export async function checkNeonDatabase(db) {
  const rows = await db.query(
    "SELECT 1 AS ok, (SELECT count(*)::int FROM public.topic_pages WHERE status = 'published') AS published_topics",
  );
  const row = rows?.[0] || {};
  return {
    ok: row.ok === 1 || row.ok === true,
    publishedTopics: Number(row.published_topics || 0),
  };
}
