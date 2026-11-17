/**
 * Patient-facing resource retrieval for OmpathStudy Lite.
 * Ordinary lecture notes, MCQs, past papers and imported content are never eligible.
 */
const PATIENT_CONTENT_TYPES = ["patient_guide", "patient_information", "health_guide", "Patient Guide", "Patient Information", "Health Guide"];
const clean = (value, max = 240) => String(value ?? "").replace(/[<>]/g, "").trim().slice(0, max);
function resourceDbUrl() {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return null;
  return { base: base.replace(/\/$/, ""), key };
}
function searchTerms(value) {
  return [...new Set(clean(value, 240).toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length >= 3).slice(0, 6))];
}
/** Search only published, reviewed/verified patient-facing content; otherwise return []. */
export async function searchReviewedPatientResources({ query, language = "en", limit = 4 } = {}) {
  const config = resourceDbUrl();
  if (!config) return [];
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const params = new URLSearchParams({
    select: "id,title,slug,category,content_type,verification_status,meta_description,content,updated_at",
    published: "eq.true",
    deleted_at: "is.null",
    requires_review: "eq.false",
    verification_status: "in.(reviewed,verified)",
    content_type: `in.(${PATIENT_CONTENT_TYPES.map((type) => `"${type}"`).join(",")})`,
    order: "updated_at.desc",
    limit: String(Math.min(5, Math.max(1, Number(limit) || 4))),
  });
  const clauses = terms.flatMap((term) => [`title.ilike.*${term}*`, `category.ilike.*${term}*`, `meta_description.ilike.*${term}*`]);
  params.set("or", `(${clauses.join(",")})`);
  try {
    const response = await fetch(`${config.base}/rest/v1/articles?${params}`, {
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) { console.error("Lite patient-resource lookup failed:", response.status); return []; }
    const rows = await response.json();
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, 5).map((row) => ({
      id: clean(row.id, 36), title: clean(row.title, 180), slug: clean(row.slug, 180),
      category: clean(row.category, 100), contentType: clean(row.content_type, 60),
      verificationStatus: row.verification_status, summary: clean(row.meta_description, 500),
      content: clean(row.content, 6000), updatedAt: row.updated_at || null,
      source: "OmpathStudy reviewed patient resource", language,
    }));
  } catch { return []; }
}
export function isEligiblePatientResource(row) {
  return Boolean(row && row.published === true && row.deleted_at == null && row.requires_review === false &&
    ["reviewed", "verified"].includes(row.verification_status) && PATIENT_CONTENT_TYPES.includes(row.content_type));
}