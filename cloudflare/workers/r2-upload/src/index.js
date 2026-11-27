// Neon-authenticated R2 gateway. The Neon Data API verifies JWT signatures on the role RPC.
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "application/pdf"];
const ALLOWED_BUCKETS = new Set(["study-resources", "contest-posters", "story-covers"]);
const MAX_BYTES = 15 * 1024 * 1024;
const hits = new Map();

const cors = (env, req) => {
  const origin = req.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").includes(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
    "Vary": "Origin",
  };
};
const json = (env, req, body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(env, req), "Content-Type": "application/json" } });
const safePath = (value) =>
  String(value || "").replace(/^\/+/, "").replace(/\\/g, "/")
    .split("/").filter((part) => part && part !== "." && part !== "..").join("/");

async function identify(req, env) {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || !env.NEON_DATA_API_URL) return null;

  let claims;
  try {
    claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
  const userId = String(claims.sub || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return null;

  // Do not trust the decoded claims alone: this RPC is authenticated by Neon and verifies the JWT.
  const response = await fetch(`${env.NEON_DATA_API_URL}/rpc/has_role`, {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ _user_id: userId, _role: "admin" }),
  });
  if (!response.ok) return null;
  return { userId, isAdmin: (await response.json()) === true };
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(env, req) });
    if (req.method !== "POST" && req.method !== "DELETE") return json(env, req, { error: "POST or DELETE only" }, 405);

    try {
      const user = await identify(req, env);
      if (!user) return json(env, req, { error: "A valid signed-in account is required." }, 401);

      const body = await req.json();
      const bucket = String(body.bucket || "");
      if (!ALLOWED_BUCKETS.has(bucket)) return json(env, req, { error: "Invalid storage bucket." }, 400);

      if (req.method === "DELETE") {
        if (!user.isAdmin) return json(env, req, { error: "Administrator access required." }, 403);
        const paths = Array.isArray(body.paths) ? body.paths.map(safePath).filter(Boolean) : [];
        if (!paths.length || paths.length > 100) return json(env, req, { error: "Provide 1–100 file paths." }, 400);
        await Promise.all(paths.map((path) => env.BUCKET.delete(`${bucket}/${path}`)));
        return json(env, req, { deleted: paths.length });
      }

      const match = typeof body.dataUrl === "string"
        ? body.dataUrl.match(/^data:([^;]+);base64,([\\s\\S]+)$/)
        : null;
      if (!match) return json(env, req, { error: "Invalid data URL." }, 400);

      const contentType = match[1].toLowerCase();
      if (!ALLOWED_TYPES.includes(contentType) ||
          (!user.isAdmin && (!contentType.startsWith("image/") || bucket !== "story-covers"))) {
        return json(env, req, { error: "Unsupported file type or permission." }, 403);
      }

      const binary = atob(match[2].replace(/\\s/g, ""));
      const limit = user.isAdmin ? MAX_BYTES : 6 * 1024 * 1024;
      if (binary.length > limit) return json(env, req, { error: "File too large." }, 413);

      if (!user.isAdmin) {
        const now = Date.now();
        const recent = (hits.get(user.userId) || []).filter((time) => now - time < 3600000);
        if (recent.length >= 5) return json(env, req, { error: "Upload limit reached. Try again later." }, 429);
        recent.push(now);
        hits.set(user.userId, recent);
      }

      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const suppliedPath = safePath(body.path);
      const filename = String(body.filename || "file").split("/").pop()
        .replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100) || "file";
      const now = new Date();
      const key = suppliedPath || `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}-${filename}`;

      await env.BUCKET.put(`${bucket}/${key}`, bytes, { httpMetadata: { contentType } });
      return json(env, req, { key, url: `${env.PUBLIC_BASE}/${bucket}/${key}` });
    } catch (error) {
      return json(env, req, { error: error?.message || String(error) }, 400);
    }
  },
};
