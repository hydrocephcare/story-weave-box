// Same request and response as the Supabase function: POST { dataUrl, filename } -> { url, key }.
// Differences from the old function: the caller must be a signed-in site admin, SVG is refused, and browsers on other sites are refused.
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "application/pdf"];
const MAX_BYTES = 15 * 1024 * 1024;
const hits = new Map();

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
      // only site admins publish images: the old function let anyone upload to the public CDN
      const user = await who.json();
      const adm = await fetch(`${env.AUTH_URL}/rest/v1/rpc/has_role`, { method: "POST", headers: { Authorization: auth, apikey, "Content-Type": "application/json" }, body: JSON.stringify({ _user_id: user.id, _role: "admin" }) });
      const isAdmin = adm.ok && (await adm.json()) === true;
      // signed-in students may add story pictures only: small images, a few per hour. Everything else stays admin only.
      if (!isAdmin) {
        const now0 = Date.now(); const mine = (hits.get(user.id) || []).filter((t) => now0 - t < 3_600_000);
        if (mine.length >= 12) return json(env, req, { error: "You have added a lot of pictures this hour. Please try again later." }, 429);
        hits.set(user.id, [...mine, now0]); if (hits.size > 5000) hits.clear();
      }

      const { dataUrl, filename } = await req.json();
      if (typeof dataUrl !== "string") throw new Error("dataUrl required");
      const m = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
      if (!m) throw new Error("dataUrl must be a base64 data URL");
      const contentType = m[1].toLowerCase();
      if (!ALLOWED.includes(contentType) || (!isAdmin && contentType === "application/pdf")) throw new Error(`unsupported type: ${contentType}`);
      const bin = atob(m[2].replace(/\s/g, ""));
      if (bin.length > (isAdmin ? MAX_BYTES : 6 * 1024 * 1024)) throw new Error(isAdmin ? "file too large (max 15MB)" : "That picture is too large (6 MB at most).");
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));

      const ext = contentType === "image/jpeg" ? "jpg" : contentType === "application/pdf" ? "pdf" : contentType.split("/")[1].replace(/[^a-z0-9]/g, "");
      const base = String(filename || "image").replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "image";
      const now = new Date();
      const key = `uploads/${isAdmin ? "" : "stories/"}${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${base}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      await env.BUCKET.put(key, bytes, { httpMetadata: { contentType } });
      return json(env, req, { url: `${env.PUBLIC_BASE}/${key}`, key });
    } catch (e) {
      return json(env, req, { error: e?.message || String(e) }, 400);
    }
  },
};
