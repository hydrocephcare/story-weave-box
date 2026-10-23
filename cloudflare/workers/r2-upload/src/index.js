// Same request and response as the Supabase function: POST { dataUrl, filename } -> { url, key }.
// Difference: the caller must be a signed-in user (checked against the auth service), and browsers on other sites are refused.
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/svg+xml", "application/pdf"];
const MAX_BYTES = 15 * 1024 * 1024;

const cors = (env, req) => {
  const o = req.headers.get("Origin") || "";
  const ok = String(env.ALLOWED_ORIGINS || "").split(",").includes(o);
  return { "Access-Control-Allow-Origin": ok ? o : "null", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Vary": "Origin" };
};
const json = (env, req, body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(env, req), "Content-Type": "application/json" } });

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(env, req) });
    if (req.method !== "POST") return json(env, req, { error: "POST only" }, 405);
    try {
      const auth = req.headers.get("Authorization") || "";
      const apikey = req.headers.get("apikey") || "";
      const who = await fetch(`${env.AUTH_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey } });
      if (!auth.startsWith("Bearer ") || !who.ok) return json(env, req, { error: "Sign in to upload." }, 401);

      const { dataUrl, filename } = await req.json();
      if (typeof dataUrl !== "string") throw new Error("dataUrl required");
      const m = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
      if (!m) throw new Error("dataUrl must be a base64 data URL");
      const contentType = m[1].toLowerCase();
      if (!ALLOWED.includes(contentType)) throw new Error(`unsupported type: ${contentType}`);
      const bin = atob(m[2].replace(/\s/g, ""));
      if (bin.length > MAX_BYTES) throw new Error("file too large (max 15MB)");
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));

      const ext = contentType === "image/jpeg" ? "jpg" : contentType === "application/pdf" ? "pdf" : contentType.split("/")[1].replace(/[^a-z0-9]/g, "");
      const base = String(filename || "image").replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "image";
      const now = new Date();
      const key = `uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${base}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      await env.BUCKET.put(key, bytes, { httpMetadata: { contentType } });
      return json(env, req, { url: `${env.PUBLIC_BASE}/${key}`, key });
    } catch (e) {
      return json(env, req, { error: e?.message || String(e) }, 400);
    }
  },
};
