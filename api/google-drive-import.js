import { neon } from "@neondatabase/serverless";
import { verifyNeonToken, isNeonAdmin } from "./_lib/neonAdmin.js";

const CLIENT_ID = () => String(process.env.GOOGLE_DRIVE_CLIENT_ID || "");
const CLIENT_SECRET = () => String(process.env.GOOGLE_DRIVE_CLIENT_SECRET || "");
const db = () => {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return neon(url);
};
const json = (res, status, data) => { res.status(status); res.setHeader("Cache-Control", "no-store"); return res.json(data); };
const b64 = (bytes) => { let value = ""; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value); };
const unb64 = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
async function cryptoKey() {
  if (!CLIENT_SECRET()) throw new Error("Google Drive OAuth credentials are not configured.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(CLIENT_SECRET()));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function decrypt(value) {
  const [iv, cipher] = String(value || "").split(".");
  if (!iv || !cipher) throw new Error("Stored Google Drive token is invalid.");
  const key = await cryptoKey();
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(cipher));
  return new TextDecoder().decode(plain);
}
async function encrypt(value) {
  const key = await cryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)));
  return b64(iv) + "." + b64(cipher);
}
async function requireAdmin(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  const identity = await verifyNeonToken(token);
  if (!identity) throw new Error("Authentication required.");
  if (!(await isNeonAdmin(token))) throw new Error("Admin access required.");
  return identity;
}
async function getConnection(userId) {
  const rows = await db()`SELECT * FROM public.google_drive_connections WHERE user_id=${userId} LIMIT 1`;
  if (!rows[0]?.refresh_token_enc) throw new Error("Google Drive is not connected.");
  return rows[0];
}
async function refreshAccessToken(connection) {
  const expires = connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0;
  if (connection.access_token_enc && expires > Date.now() + 120000) {
    return { token: await decrypt(connection.access_token_enc), connection };
  }
  const refreshToken = await decrypt(connection.refresh_token_enc);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID(), client_secret: CLIENT_SECRET(), refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const tokens = await response.json().catch(() => ({}));
  if (!response.ok || !tokens.access_token) throw new Error("Google access token refresh failed. Reconnect Google Drive.");
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString();
  const accessEnc = await encrypt(tokens.access_token);
  await db()`UPDATE public.google_drive_connections SET access_token_enc=${accessEnc},access_token_expires_at=${expiresAt},updated_at=now() WHERE user_id=${connection.user_id}`;
  return { token: tokens.access_token, connection: { ...connection, access_token_enc: accessEnc, access_token_expires_at: expiresAt } };
}
async function driveFetch(url, token) {
  const response = await fetch(url, { headers: { authorization: "Bearer " + token } });
  if (!response.ok) throw new Error("Google Drive API " + response.status + ": " + (await response.text()).slice(0, 300));
  return response;
}
const safeName = (value) => String(value || "untitled").replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().slice(0, 180) || "untitled";
function inferCategory(value) {
  const p = String(value || "").toLowerCase();
  if (/(past paper|past papers|previous exam)/.test(p)) return "Past Papers";
  if (/(mcq|question bank|questions)/.test(p)) return "MCQs";
  if (/(cat|continuous assessment|assessment)/.test(p)) return "CATs";
  if (/(clinical|case|cases)/.test(p)) return "Clinical Cases";
  if (/(spotter|practical|ospe|osce)/.test(p)) return "Practical/Spotters";
  if (/(lecture|slides|powerpoint|ppt)/.test(p)) return "Lecture Materials";
  if (/(revision|review|summary)/.test(p)) return "Revision";
  if (/(note|notes)/.test(p)) return "Notes";
  return "Other Resources";
}
async function startJob(userId, folderId) {
  const active = await db()`SELECT id,status FROM public.google_drive_import_jobs WHERE user_id=${userId}
    AND root_folder_id=${folderId} AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1`;
  if (active[0]) return active[0];
  const rows = await db()`INSERT INTO public.google_drive_import_jobs (user_id,root_folder_id,status)
    VALUES (${userId},${folderId},'queued') RETURNING *`;
  const job = rows[0];
  await db()`INSERT INTO public.google_drive_import_items (job_id,user_id,google_file_id,name,mime_type,relative_path,status)
    VALUES (${job.id},${userId},${folderId},'Year 1 source folder','application/vnd.google-apps.folder','','pending')
    ON CONFLICT (job_id,google_file_id) DO NOTHING`;
  return job;
}
async function processJob(userId, jobId) {
  const jobs = await db()`SELECT * FROM public.google_drive_import_jobs WHERE id=${jobId} AND user_id=${userId} LIMIT 1`;
  const job = jobs[0];
  if (!job) throw new Error("Import job not found.");
  await db()`UPDATE public.google_drive_import_jobs SET status='running',updated_at=now() WHERE id=${jobId}`;
  const items = await db()`SELECT * FROM public.google_drive_import_items WHERE job_id=${jobId} AND status='pending' ORDER BY created_at LIMIT 1`;
  const item = items[0];
  if (!item) {
    await db()`UPDATE public.google_drive_import_jobs SET status='completed',updated_at=now() WHERE id=${jobId}`;
    return { done: true };
  }
  await db()`UPDATE public.google_drive_import_items SET status='processing',updated_at=now() WHERE id=${item.id}`;
  try {
    const connection = await getConnection(userId);
    const { token } = await refreshAccessToken(connection);
    if (item.mime_type === "application/vnd.google-apps.folder") {
      let pageToken = "";
      let discovered = 0, bytes = 0;
      do {
        const params = new URLSearchParams({
          q: "'" + item.google_file_id + "' in parents and trashed = false",
          pageSize: "1000",
          fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,parents)",
          orderBy: "name", includeItemsFromAllDrives: "true", supportsAllDrives: "true",
        });
        if (pageToken) params.set("pageToken", pageToken);
        const payload = await (await driveFetch("https://www.googleapis.com/drive/v3/files?" + params, token)).json();
        for (const child of payload.files || []) {
          if (child.mimeType === "application/vnd.google-apps.shortcut") continue;
          const childPath = item.relative_path ? item.relative_path + "/" + safeName(child.name) : safeName(child.name);
          const size = Number(child.size || 0);
          await db()`INSERT INTO public.google_drive_import_items
            (job_id,user_id,google_file_id,parent_google_file_id,name,mime_type,size_bytes,modified_time,relative_path,web_url,status)
            VALUES (${jobId},${userId},${child.id},${item.google_file_id},${safeName(child.name)},${child.mimeType},${size},${child.modifiedTime || null},${childPath},${child.webViewLink || null},'pending')
            ON CONFLICT (job_id,google_file_id) DO NOTHING`;
          if (child.mimeType !== "application/vnd.google-apps.folder") { discovered++; bytes += size; }
        }
        pageToken = payload.nextPageToken || "";
      } while (pageToken);
      await db()`UPDATE public.google_drive_import_items SET status='imported',updated_at=now() WHERE id=${item.id}`;
      await db()`UPDATE public.google_drive_import_jobs SET total_items=total_items+${discovered},discovered_bytes=discovered_bytes+${bytes},updated_at=now() WHERE id=${jobId}`;
      return { done: false, kind: "folder", discovered };
    }
    const title = String(item.name || "").replace(/\.[^.]+$/, "").trim() || "Untitled resource";
    const fileUrl = item.web_url || "https://drive.google.com/file/d/" + encodeURIComponent(item.google_file_id) + "/view";
    const filePath = "drive://" + item.google_file_id;
    const unit = String(item.relative_path || "").split("/")[0] || "General";
    const resources = await db()`INSERT INTO public.study_resources
      (year,unit,title,category,file_name,file_path,file_type,file_size,storage_url,google_drive_file_id,source_modified_at,download_enabled,published,updated_at)
      VALUES (1,${unit},${title},${inferCategory(item.relative_path || item.name)},${safeName(item.name)},${filePath},${item.mime_type},${Number(item.size_bytes || 0)},${fileUrl},${item.google_file_id},${item.modified_time || null},true,true,now())
      ON CONFLICT (file_path) DO UPDATE SET title=EXCLUDED.title,category=EXCLUDED.category,file_name=EXCLUDED.file_name,
        file_type=EXCLUDED.file_type,file_size=EXCLUDED.file_size,storage_url=EXCLUDED.storage_url,
        source_modified_at=EXCLUDED.source_modified_at,download_enabled=true,published=true,updated_at=now()
      RETURNING id`;
    await db()`UPDATE public.google_drive_import_items SET status='imported',public_url=${fileUrl},error=NULL,updated_at=now() WHERE id=${item.id}`;
    await db()`UPDATE public.google_drive_import_jobs SET completed_items=completed_items+1,updated_at=now() WHERE id=${jobId}`;
    return { done: false, kind: "link", resource_id: resources[0]?.id, name: item.name, url: fileUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
    await db()`UPDATE public.google_drive_import_items SET status='failed',error=${message},updated_at=now() WHERE id=${item.id}`;
    await db()`UPDATE public.google_drive_import_jobs SET failed_items=failed_items+1,last_error=${message},updated_at=now() WHERE id=${jobId}`;
    return { done: false, kind: "error", error: message, item: item.name };
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return json(res, 405, { error: "POST required." });
  try {
    const user = await requireAdmin(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const action = String(body.action || "status");
    if (action === "connection-status") {
      const rows = await db()`SELECT google_email FROM public.google_drive_connections WHERE user_id=${user.id} LIMIT 1`;
      return json(res, 200, { email: rows[0]?.google_email || null });
    }
    if (action === "status") {
      const jobId = String(body.job_id || "").trim();
      if (jobId) {
        const rows = await db()`SELECT * FROM public.google_drive_import_jobs WHERE id=${jobId} AND user_id=${user.id} LIMIT 1`;
        const job = rows[0] || null;
        const pendingRows = job ? await db()`SELECT count(*)::int AS count FROM public.google_drive_import_items WHERE job_id=${jobId} AND status='pending'` : [];
        return json(res, 200, { job, pending: Number(pendingRows[0]?.count || 0) });
      }
      const jobs = await db()`SELECT * FROM public.google_drive_import_jobs WHERE user_id=${user.id} ORDER BY created_at DESC LIMIT 10`;
      return json(res, 200, { jobs });
    }
    if (action === "test") {
      if (!CLIENT_ID() || !CLIENT_SECRET()) return json(res, 503, { error: "Google Drive OAuth credentials are not configured in Cloudflare." });
      const folderId = String(body.folder_id || "").trim();
      if (!folderId) return json(res, 400, { error: "folder_id is required." });
      const connection = await getConnection(user.id);
      const { token } = await refreshAccessToken(connection);
      const params = new URLSearchParams({ fields: "id,name,mimeType,webViewLink", supportsAllDrives: "true" });
      const folder = await (await driveFetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(folderId) + "?" + params, token)).json();
      if (folder.mimeType !== "application/vnd.google-apps.folder") return json(res, 400, { error: "The supplied ID is not a Google Drive folder." });
      const childrenParams = new URLSearchParams({ q: "'" + folderId + "' in parents and trashed = false", pageSize: "100", fields: "files(id,name,mimeType)", includeItemsFromAllDrives: "true", supportsAllDrives: "true" });
      const children = await (await driveFetch("https://www.googleapis.com/drive/v3/files?" + childrenParams, token)).json();
      return json(res, 200, { ok: true, folder, child_count: (children.files || []).length });
    }
    if (action === "start") {
      const folderId = String(body.folder_id || "").trim();
      if (!folderId) return json(res, 400, { error: "folder_id is required." });
      if (!CLIENT_ID() || !CLIENT_SECRET()) return json(res, 503, { error: "Google Drive OAuth credentials are not configured in Cloudflare." });
      const job = await startJob(user.id, folderId);
      return json(res, 200, { job });
    }
    if (action === "process") {
      const jobId = String(body.job_id || "").trim();
      if (!jobId) return json(res, 400, { error: "job_id is required." });
      if (!CLIENT_ID() || !CLIENT_SECRET()) return json(res, 503, { error: "Google Drive OAuth credentials are not configured in Cloudflare." });
      return json(res, 200, await processJob(user.id, jobId));
    }
    return json(res, 400, { error: "Unknown action." });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /Authentication required/.test(message) ? 401 : /Admin access/.test(message) ? 403 : 400;
    console.error("[google-drive-import]", message);
    return json(res, status, { error: message });
  }
}
