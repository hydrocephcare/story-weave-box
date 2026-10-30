// Database door for the OmpathStudy publishing gateway (cloudflare/workers/publish-mcp).
//
// The gateway Worker cannot hold this project's service-role key (the project is managed, so the key is not available to copy). Instead it calls
// this function, which runs inside the project where the key is supplied automatically, and which does ONLY what the gateway needs:
//   - read articles and the year / semester / unit lists
//   - call the category_counts function
//   - insert an article, with a fixed set of columns
//   - update ONE article by id, with a fixed set of columns
// Every call must carry the shared secret in the x-gateway-secret header (the function secret GATEWAY_DB_SECRET). Nothing else in the database
// can be reached through it: no profiles, payments, access codes, comments or auth data.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

const READ = /^(articles|academic_years|semesters|units)\?[A-Za-z0-9_=,.*()%&:+\-<>"'\s]*$/;
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const PATCH_PATH = new RegExp(`^articles\\?id=eq\\.${UUID}$`);
const INSERT_COLS = new Set(["title", "slug", "content", "category", "unit", "tags", "meta_description", "published", "content_kind", "content_type", "source_type", "is_raw"]);
const PATCH_COLS = new Set(["title", "content", "category", "unit", "published", "deleted_at", "tags", "meta_title", "meta_description", "featured_image", "updated_at"]);

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const onlyCols = (o: unknown, allowed: Set<string>) => !!o && typeof o === "object" && !Array.isArray(o) && Object.keys(o as object).every((k) => allowed.has(k));

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const secret = Deno.env.get("GATEWAY_DB_SECRET") ?? "";
  if (secret.length < 24) return json({ error: "GATEWAY_DB_SECRET is not set on this function (needs 24+ characters)." }, 503);
  if (!same(req.headers.get("x-gateway-secret") ?? "", secret)) return json({ error: "forbidden" }, 403);

  let call: { method?: string; path?: string; body?: unknown };
  try { call = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const method = String(call.method ?? "GET").toUpperCase();
  const path = String(call.path ?? "");

  if (method === "GET") {
    if (!READ.test(path) || path.length > 3000) return json({ error: "not allowed" }, 400);
  } else if (method === "POST" && path === "rpc/category_counts") {
    // allowed, takes no input
  } else if (method === "POST" && path === "articles") {
    if (!onlyCols(call.body, INSERT_COLS)) return json({ error: "column not allowed" }, 400);
  } else if (method === "PATCH" && PATCH_PATH.test(path)) {
    if (!onlyCols(call.body, PATCH_COLS)) return json({ error: "column not allowed" }, 400);
  } else {
    return json({ error: "not allowed" }, 400);
  }

  const base = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const r = await fetch(`${base}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: method === "GET" ? undefined : JSON.stringify(call.body ?? {}),
  });
  return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json" } });
});
