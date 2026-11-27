// R2 upload/delete gateway authenticated with Neon Auth JWTs.
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "application/pdf"];
const ALLOWED_BUCKETS = new Set(["study-resources", "contest-posters", "story-covers"]);
const MAX_BYTES = 15 * 1024 * 1024;
const hits = new Map();
const cors = (env, req) => { const origin = req.headers.get("Origin") || ""; const ok = String(env.ALLOWED_ORIGINS || "").split(",").includes(origin); return { "Access-Control-Allow-Origin": ok ? origin : "null", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS", "Vary": "Origin" }; };
const json = (env, req, body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(env, req), "Content-Type": "application/json" } });
const safePath = (value) => String(value || "").replace(/^\/+/, "").replace(/\\/g, "/").split("/").filter((part) => part && part !== "." && part !== "..").join("/");
async function identify(req, env) {
  const auth = req.headers.get("Authorization") || ""; const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !env.NEON_DATA_API_URL) return null;
  let claims; try { claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { return null; }
  const userId = String(claims.sub || ""); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return null;
  // Neon Dat¶»§q«^