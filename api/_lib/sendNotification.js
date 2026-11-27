import { neon } from "@neondatabase/serverless";
import { isNeonAdmin, verifyNeonToken } from "./neonAdmin.js";
const json = (res, status, body) => res.status(status).json(body);
const db = () => {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("Neon database is not configured.");
  return neon(url);
};
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[char] || char));

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(res, 401, { error: "Authentication required." });
  if (!(await isNeonAdmin(token))) return json(res, 403, { error: "Administrator access required." });

  try {
    const identity = await verifyNeonToken(token);
    if (!identity) return json(res, 401, { error: "Invalid administrator session." });
    const userId = identity.id;
    const adminEmail = identity.email;
    const sql = db();
    const ensureNeonUser = async (neonId) => {
      await sql.query("INSERT INTO auth.users(id,email) VALUES($1,NULL) ON CONFLICT(id) DO NOTHING", [neonId]);
      return neonId;
    };
    const adminNeonId = await ensureNeonUser(userId);

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const title = String(body.title || "").trim().slice(0, 120);
    const message = String(body.message || "").trim().slice(0, 4000);
    const audience = ["all_users", "subscribers", "study_year"].includes(body.audience) ? body.audience : "all_users";
    const studyYear = audience === "study_year" ? Number(body.study_year) : null;
    const rawUrl = String(body.action_url || "").trim();
    const actionUrl = rawUrl && /^https:\/\/(www\.)?ompathstudy\.com(?:\/|$)/i.test(rawUrl) ? rawUrl : null;
    if (!title || !message) return json(res, 400, { error: "Title and message are required." });
    if (audience === "study_year" && (!Number.isInteger(studyYear) || studyYear < 1 || studyYear > 6)) {
      return json(res, 400, { error: "Choose a study year from 1 to 6." });
    }

    let recipients;
    if (audience === "study_year") {
      recipients = await sql.query(`SELECT DISTINCT n.id AS neon_id,n.email
        FROM neon_auth."user" n
        JOIN public.profiles p ON p.user_id=n.id
        WHERE p.study_year=$1 AND n.email IS NOT NULL AND n."emailVerified"=true`, [studyYear]);
    } else if (audience === "subscribers") {
      recipients = await sql.query(`SELECT DISTINCT n.id AS neon_id,n.email
        FROM neon_auth."user" n
        JOIN public.access_grants g ON g.user_id=n.id
        WHERE n.email IS NOT NULL AND n."emailVerified"=true
          AND (g.expires_at IS NULL OR g.expires_at > now())
          AND coalesce(g.scope,'all') IN ('all','premium','content')`);
    } else {
      recipients = await sql.query('SELECT id AS neon_id,email FROM neon_auth."user" WHERE email IS NOT NULL AND "emailVerified"=true');
    }

    const unique = new Map();
    for (const r of recipients) {
      const email = String(r.email || "").trim().toLowerCase();
      if (!r.neon_id || !email) continue;
      const neonId = await ensureNeonUser(String(r.neon_id));
      if (!unique.has(neonId)) unique.set(neonId, { id: neonId, email });
    }
    const users = [...unique.values()];

    const campaigns = await sql.query(`INSERT INTO public.notification_campaigns
      (title,message,action_url,audience,study_year,status,recipient_count,created_by)
      VALUES ($1,$2,$3,$4,$5,'sending',$6,$7) RETURNING id`,
      [title, message, actionUrl, audience, studyYear, users.length, adminNeonId]);
    const campaignId = campaigns[0]?.id;
    if (!campaignId) throw new Error("Could not create notification campaign.");

    for (let i = 0; i < users.length; i += 300) {
      const batch = users.slice(i, i + 300);
      const values = [];
      const tuples = batch.map((u, j) => {
        const n = j * 5;
        values.push(campaignId, u.id, title, message, actionUrl);
        return `($${n + 1},$${n + 2},$${n + 3},$${n + 4},$${n + 5})`;
      });
      await sql.query(`INSERT INTO public.user_notifications (campaign_id,user_id,title,message,action_url) VALUES ${tuples.join(",")}`, values);
    }

    const resendKey = String(process.env.RESEND_API_KEY || "");
    const from = process.env.NOTIFICATION_FROM_EMAIL || "Ompath Study <notifications@ompathstudy.com>";
    let delivered = 0, failed = 0;
    if (!resendKey) {
      await sql.query("UPDATE public.user_notifications SET email_status='skipped',email_error='Email provider is not configured' WHERE campaign_id=$1", [campaignId]);
    } else {
      const optedOutRows = await sql.query("SELECT user_id FROM public.notification_preferences WHERE email_enabled=false");
      const optedOut = new Set(optedOutRows.map((x) => String(x.user_id)));
      for (const u of users) {
        if (optedOut.has(u.id)) {
          await sql.query("UPDATE public.user_notifications SET email_status='skipped' WHERE campaign_id=$1 AND user_id=$2", [campaignId, u.id]);
          continue;
        }
        const link = actionUrl ? `<p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 18px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px">Open Ompath Study</a></p>` : "";
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: "Bearer " + resendKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            from, to: [u.email], subject: title,
            text: `${message}${actionUrl ? `\n\nOpen: ${actionUrl}` : ""}\n\nManage notifications in your Ompath Study account.`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h1 style="color:#0f766e">${escapeHtml(title)}</h1><p style="white-space:pre-wrap">${escapeHtml(message)}</p>${link}<p style="font-size:12px;color:#64748b">You received this account notification from Ompath Study. Manage email notifications in your account.</p></div>`,
          }),
          signal: AbortSignal.timeout(12000),
        });
        const emailStatus = response.ok ? "sent" : "failed";
        const errorText = response.ok ? null : (await response.text()).slice(0, 500);
        await sql.query("UPDATE public.user_notifications SET email_status=$1,email_error=$2 WHERE campaign_id=$3 AND user_id=$4", [emailStatus, errorText, campaignId, u.id]);
        if (response.ok) delivered++; else failed++;
      }
    }

    const status = !resendKey ? "partial" : failed ? (delivered ? "partial" : "failed") : "sent";
    await sql.query("UPDATE public.notification_campaigns SET status=$1,delivered_count=$2,failed_count=$3,sent_at=now() WHERE id=$4", [status, delivered, failed, campaignId]);
    return json(res, 200, { success: true, campaign_id: campaignId, recipients: users.length, email_configured: Boolean(resendKey), delivered, failed, status });
  } catch (error) {
    console.error("[send-notification]", error instanceof Error ? error.message : String(error));
    return json(res, 500, { error: "Notification could not be sent. Check the server logs." });
  }
}
