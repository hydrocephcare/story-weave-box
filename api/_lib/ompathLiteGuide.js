import { getHealthGuideToken } from "./ompathLiteHealth.js";

const PATIENT_TYPES = ["patient_guide", "patient_information", "health_guide", "Patient Guide", "Patient Information", "Health Guide"];
const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const plainText = (value) => String(value ?? "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

async function loadApprovedGuide(slug) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Guide storage is not configured.");
  const params = new URLSearchParams({
    select: "title,content,meta_description,content_type,verification_status,published,requires_review,deleted_at",
    slug: "eq." + slug,
    published: "eq.true",
    requires_review: "eq.false",
    deleted_at: "is.null",
    verification_status: "in.(reviewed,verified)",
    content_type: "in.(" + PATIENT_TYPES.map((x) => '"' + x + '"').join(",") + ")",
    limit: "1",
  });
  const response = await fetch(base.replace(/\/$/, "") + "/rest/v1/articles?" + params, {
    headers: { apikey: key, Authorization: "Bearer " + key, Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Approved guide lookup failed.");
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed.");
  try {
    const token = String(req.query?.token || "");
    const access = await getHealthGuideToken(token);
    if (!access) return res.status(404).send("This health information link is invalid or has expired. Please contact your health facility if you still need assistance.");
    const guide = await loadApprovedGuide(access.resource_slug);
    if (!guide) return res.status(404).send("This health information is no longer available. Please seek advice from a qualified health professional.");
    const title = esc(guide.title);
    const summary = esc(guide.meta_description || "");
    const content = esc(plainText(guide.content));
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send("<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>" + title + " | OmpathStudy</title><style>body{font:16px/1.65 system-ui,sans-serif;max-width:760px;margin:0 auto;padding:24px;color:#172033;background:#f7f8fa}main{background:white;padding:clamp(20px,5vw,40px);border-radius:16px}h1{line-height:1.2}p{color:#475569}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}footer{border-top:1px solid #e2e8f0;margin-top:28px;padding-top:18px;color:#475569;font-size:14px}</style><main><p><strong>OmpathStudy Health Information</strong></p><h1>" + title + "</h1><p>" + summary + "</p><pre>" + content + "</pre><footer>This information is educational and does not replace assessment by a qualified health professional. If you have severe symptoms or feel unsafe, seek emergency care immediately. This private link expires after seven days.</footer></main></html>");
  } catch (error) {
    console.error("Private health guide request failed:", error.message);
    return res.status(500).send("We could not load this health information. Please try again later.");
  }
}
