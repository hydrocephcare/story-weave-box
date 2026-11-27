import { neon } from "@neondatabase/serverless";
import { verifyNeonToken, isNeonAdmin } from "./_lib/neonAdmin.js";

const APP_ORIGIN = "https://ompathstudy.com";
const DEFAULT_REDIRECT = "https://ompathstudy.com/api/google-drive-oauth";
const db = () => {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return neon(url);
};
const clientId = () => String(process.env.GOOGLE_DRIVE_CLIENT_ID || "");
const clientSecret = () => String(process.env.GOOGLE_DRIVE_CLIENT_SECRET || "");
const redirectUri = () => String(process.env.GOOGLE_DRIVE_REDIRECT_URI || DEFAULT_REDIRECT);
const cors = { "Access-Control-Allow-Origin": APP_ORIGIN, "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };
const json = (res, status, data) => {
  res.status(status);
  res.setHeader("Cache-Control", "no-store");
  return res.json(data);
};

function b64(bytes) { let value = ""; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value); }
async function encrypt(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clientSecret()));
  const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)));
  return b64(iv) + "." + b64(encrypted);
}
function html(res, message, ok = true) {
  const safe = String(message).replace(/[<>&"]/g, (c) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;" }[c]));
  const page = `<!doctype html><html><head><meta charset="utf-8"><title>OmpathStudy Drive</title></head><body style="font-family:system-ui;padding:40px"><h2>${ok ? "Google Drive connected" : "Connection failed"}</h2><p>${safe}</p><script>if(window.opener){window.opener.postMessage({source:"ompathstudy-google-drive",ok:${ok}}, "https://ompathstudy.com");}</script></body></html>`;
  res.status(ok ? 200 : 400);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.send(page);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", APP_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", cors["Access-Control-Allow-Headers"]);
  res.setHeader("Access-Control-Allow-Methods", cors["Access-Control-Allow-Methods"]);
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  const url = new URL(req.url, APP_ORIGIN);

  if (req.method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    if (error) return html(res, "Google authorization was cancelled: " + error, false);
    if (!code || !state) return html(res, "Missing OAuth code or state.", false);
    if (!clientId() || !clientSecret()) return html(res, "Google Drive OAuth is not configured in Cloudflare.", false);
    try {
      const rows = await db()`SELECT state,user_id,expires_at FROM public.google_drive_oauth_states WHERE state=${state} LIMIT 1`;
      const stateRow = rows[0];
      if (!stateRow) return html(res, "This authorization session is invalid or has already been used.", false);
      await db()`DELETE FROM public.google_drive_oauth_states WHERE state=${state}`;
      if (new Date(stateRow.expires_at).getTime() < Date.now()) return html(res, "This authorization session expired. Please start again.", false);

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: clientId(), client_secret: clientSecret(), redirect_uri: redirectUri(), grant_type: "authorization_code" }),
      });
      const tokens = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || !tokens.access_token) return html(res, "Google token exchange failed. Check the OAuth client and redirect URI.", false);
      const infoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { authorization: "Bearer " + tokens.access_token } });
      const info = infoResponse.ok ? await infoResponse.json().catch(() => ({})) : {};
      const existing = await db()`SELECT refresh_token_enc FROM public.google_drive_connections WHERE user_id=${stateRow.user_id} LIMIT 1`;
      const refreshTokenEnc = tokens.refresh_token ? await encrypt(tokens.refresh_token) : existing[0]?.refresh_token_enc || null;
      if (!refreshTokenEnc) return html(res, "Google did not return a refresh token. Reconnect and approve offline access.", false);
      const accessTokenEnc = await encrypt(tokens.access_token);
      const expiresAt = new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString();
      await db()`INSERT INTO public.google_drive_connections (user_id,google_email,refresh_token_enc,access_token_enc,access_token_expires_at,scope,updated_at)
        VALUES (${stateRow.user_id},${info.email || null},${refreshTokenEnc},${accessTokenEnc},${expiresAt},${tokens.scope || "https://www.googleapis.com/auth/drive.readonly"},now())
        ON CONFLICT (user_id) DO UPDATE SET google_email=EXCLUDED.google_email,refresh_token_enc=EXCLUDED.refresh_token_enc,
          access_token_enc=EXCLUDED.access_token_enc,access_token_expires_at=EXCLUDED.access_token_expires_at,scope=EXCLUDED.scope,updated_at=now()`;
      return html(res, "Connected to Google Drive" + (info.email ? " as " + info.email : "") + ". You can close this window.");
    } catch (error) {
      console.error("[google-drive-oauth:callback]", error instanceof Error ? error.message : String(error));
      return html(res, "Google Drive connection could not be saved. Check the server logs.", false);
    }
  }

  if (req.method !== "POST") return json(res, 405, { error: "GET or POST required." });
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  const identity = await verifyNeonToken(token);
  if (!identity) return json(res, 401, { error: "Authentication required." });
  if (!(await isNeonAdmin(token))) return json(res, 403, { error: "Administrator access required." });
  if (!clientId() || !clientSecret()) return json(res, 503, { error: "Google Drive OAuth credentials are not configured in Cloudflare." });
  try {
    const state = crypto.randomUUID();
    await db()`INSERT INTO public.google_drive_oauth_states (state,user_id,redirect_to,expires_at) VALUES (${state},${identity.id},${APP_ORIGIN},now()+interval '10 minutes')`;
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId());
    authUrl.searchParams.set("redirect_uri", redirectUri());
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email https://www.googleapis.com/auth/drive.readonly");
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);
    return json(res, 200, { auth_url: authUrl.toString() });
  } catch (error) {
    console.error("[google-drive-oauth:start]", error instanceof Error ? error.message : String(error));
    return json(res, 500, { error: "Could not start Google authorization." });
  }
}
