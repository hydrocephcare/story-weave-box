import { getHealthGuideToken } from "./ompathLiteHealth.js";

const PATIENT_TYPES = ["patient_guide", "patient_information", "health_guide", "Patient Guide", "Patient Information", "Health Guide"];
const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
async function loadApprovedGuide(slug) {
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Guide storage is not configured.");
  const headers = { apikey: key, Authorization: "Bearer " + key, Accept: "application/json" };
  const articleParams = new URLSearchParams({
    select: "id,title,slug,content_type,verification_status,published,requires_review,deleted_at,updated_at",
    slug: "eq." + slug, published: "eq.true", requires_review: "eq.false", deleted_at: "is.null",
    verification_status: "in.(reviewed,verified)",
    content_type: "in.(" + PATIENT_TYPES.map((x) => '"' + x + '"').join(",") + ")", limit: "1",
  });
  const articleResponse = await fetch(base.replace(/\/$/, "") + "/rest/v1/articles?" + articleParams, { headers, signal: AbortSignal.timeout(5000) });
  if (!articleResponse.ok) throw new Error("Guide lookup failed.");
  const article = (await articleResponse.json())?.[0];
  if (!article) return null;
  const approvalParams = new URLSearchParams({
    select: "status,review_due_at,article_updated_at_snapshot",
    article_id: "eq." + article.id, status: "eq.approved",
    review_due_at: "gt." + new Date().toISOString(), limit: "1",
  });
  const approvalResponse = await fetch(base.replace(/\/$/, "") + "/rest/v1/lite_patient_guide_approvals?" + approvalParams, { headers, signal: AbortSignal.timeout(5000) });
  if (!approvalResponse.ok) throw new Error("Guide approval lookup failed.");
  const approval = (await approvalResponse.json())?.[0];
  if (!approval || Date.parse(article.updated_at) > Date.parse(approval.article_updated_at_snapshot)) return null;
  return article;
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed.");
  try {
    const token = String(req.query?.token || ""), access = await getHealthGuideToken(token);
    if (!access) return res.status(404).send("This health information link is invalid or has expired. Please contact your health facility if you still need assistance.");
    const guide = await loadApprovedGuide(access.resource_slug);
    if (!guide) return res.status(404).send("This health information is no longer available. Please seek advice from a qualified health professional.");
    const title = esc(guide.title), slug = String(guide.slug || "");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return res.status(404).send("This health information is no longer available.");
    const mainUrl = "https://www.ompathstudy.com/blog/" + encodeURIComponent(slug);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send("<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><meta http-equiv='refresh' content='3;url=" + esc(mainUrl) + "'><title>Thank you | OmpathStudy</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:640px;margin:12vh auto;padding:24px;color:#172033;background:#f7f8fa}main{background:#fff;padding:32px;border-radius:16px}a{color:#075985}</style><main><h1>Thank you for using OmpathStudy</h1><p>Your clinician-approved health guide, <strong>" + title + "</strong>, is ready. We are opening it on OmpathStudy now.</p><p>If you are not redirected, <a href='" + esc(mainUrl) + "'>open your health guide</a>.</p><p>This access link expires after seven days. Do not share it.</p></main></html>");
  } catch (error) {
    console.error("Health guide request failed:", error.message);
    return res.status(500).send("We could not load this health information. Please try again later.");
  }
}
