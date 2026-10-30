// Everything that talks to the outside: the articles table (and only that table, plus the small year/semester/unit lists), the audit log,
// draft and revision storage, the kill switch, rate limits.
export interface Env {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: any;
  BUCKET: R2Bucket;
  PUBLIC_BASE: string;
  SITE_URL: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  UPLOAD_SIGNING_SECRET: string;
  PURGE_URL?: string;
  PURGE_KEY?: string;
}

export interface Props extends Record<string, unknown> { userId: string; email: string; clientId: string; clientName: string; scope: string[] }

export const SCOPES = {
  "lessons:read": "Search and read lessons, years, units and images",
  "lessons:write": "Create lessons and save drafts (nothing goes live)",
  "lessons:publish": "Publish, unpublish and archive lessons",
  "images:write": "Upload images to the OmpathStudy image storage",
  admin: "See connected assistants, the audit log, and switch publishing off",
} as const;

export const ARTICLE_COLS = "id,title,slug,category,unit,published,deleted_at,created_at,updated_at,tags,meta_title,meta_description,featured_image,source_reference";
const PATCHABLE = new Set(["title", "content", "category", "unit", "published", "deleted_at", "tags", "meta_title", "meta_description", "featured_image", "updated_at"]);

async function rest(env: Env, path: string, init: RequestInit = {}): Promise<any> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("The gateway has no database key yet: SUPABASE_SERVICE_ROLE_KEY is not set on the Worker. The owner must run: npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY");
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, ...(env.SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }), "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers as Record<string, string> | undefined) },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Database ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const enc = encodeURIComponent;
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const likeSafe = (s: string) => s.replace(/[%*_,()]/g, " ").trim();

export const db = {
  async search(env: Env, q: string, o: { category?: string; includeDrafts?: boolean; limit?: number }) {
    const term = likeSafe(q);
    let p = `articles?select=${ARTICLE_COLS}&deleted_at=is.null&or=(title.ilike.*${enc(term)}*,slug.ilike.*${enc(term.replace(/\s+/g, "-"))}*)&order=updated_at.desc&limit=${Math.min(o.limit ?? 10, 50)}`;
    if (o.category) p += `&category=eq.${enc(o.category)}`;
    if (!o.includeDrafts) p += `&published=eq.true`;
    return rest(env, p);
  },
  async list(env: Env, o: { category?: string; unit?: string; published?: boolean; limit?: number; offset?: number }) {
    let p = `articles?select=${ARTICLE_COLS}&deleted_at=is.null&order=updated_at.desc&limit=${Math.min(o.limit ?? 25, 100)}&offset=${o.offset ?? 0}`;
    if (o.category) p += `&category=eq.${enc(o.category)}`;
    if (o.unit) p += `&unit=eq.${enc(o.unit)}`;
    if (o.published !== undefined) p += `&published=eq.${o.published}`;
    return rest(env, p);
  },
  async get(env: Env, idOrSlug: string, withContent = true) {
    const key = isUuid(idOrSlug) ? `id=eq.${idOrSlug}` : `slug=eq.${enc(idOrSlug)}`;
    const rows = await rest(env, `articles?select=${ARTICLE_COLS}${withContent ? ",content" : ""}&${key}&limit=1`);
    return rows?.[0] ?? null;
  },
  async duplicates(env: Env, slug: string, title: string, category: string) {
    const a = await rest(env, `articles?select=id,title,slug,published,deleted_at&slug=eq.${enc(slug)}`);
    const b = await rest(env, `articles?select=id,title,slug,published,deleted_at&category=eq.${enc(category)}&title=ilike.${enc(likeSafe(title))}`);
    const seen = new Map<string, any>();
    [...(a ?? []), ...(b ?? [])].forEach((x: any) => seen.set(x.id, x));
    return [...seen.values()];
  },
  async insert(env: Env, row: Record<string, unknown>) {
    const rows = await rest(env, "articles", { method: "POST", body: JSON.stringify(row) });
    return rows[0];
  },
  async patch(env: Env, id: string, fields: Record<string, unknown>) {
    const clean = Object.fromEntries(Object.entries(fields).filter(([k]) => PATCHABLE.has(k)));
    if (!Object.keys(clean).length) throw new Error("Nothing to change.");
    const rows = await rest(env, `articles?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...clean, updated_at: new Date().toISOString() }) });
    return rows?.[0] ?? null;
  },
  async lookup(env: Env, table: "academic_years" | "semesters" | "units", q: { year?: string; semester?: string; limit?: number }) {
    let p = `${table}?select=*&limit=${Math.min(q.limit ?? 100, 200)}`;
    if (table === "semesters" && q.year) p += `&academic_year_id=eq.${enc(q.year)}`;
    if (table === "units" && q.semester) p += `&semester_id=eq.${enc(q.semester)}`;
    return rest(env, p);
  },
  async categories(env: Env) {
    try { const r = await rest(env, "rpc/category_counts", { method: "POST", body: "{}" }); if (Array.isArray(r)) return r; } catch { /* fall through */ }
    const rows: { category: string }[] = await rest(env, "articles?select=category&deleted_at=is.null&published=eq.true&limit=5000");
    const m = new Map<string, number>(); rows.forEach((x) => m.set(x.category, (m.get(x.category) ?? 0) + 1));
    return [...m].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
  },
  async ping(env: Env) { await rest(env, "articles?select=id&limit=1"); return true; },
};

// ---- state kept in KV ---------------------------------------------------------------------------------------------------------------
export interface Draft { content: string; title?: string; baseUpdatedAt: string | null; baseHash: string | null; by: string; updatedAt: string }
const DAY = 86400;

export const state = {
  async getDraft(env: Env, id: string): Promise<Draft | null> { return env.OAUTH_KV.get(`gw:draft:${id}`, "json"); },
  async putDraft(env: Env, id: string, d: Draft) { await env.OAUTH_KV.put(`gw:draft:${id}`, JSON.stringify(d), { expirationTtl: 30 * DAY }); },
  async delDraft(env: Env, id: string) { await env.OAUTH_KV.delete(`gw:draft:${id}`); },
  async putRevision(env: Env, id: string, snap: { title: string; content: string; published: boolean; by: string }) {
    const ts = new Date().toISOString();
    await env.OAUTH_KV.put(`gw:rev:${id}:${ts}`, JSON.stringify({ ...snap, ts }), { expirationTtl: 365 * DAY });
    return ts;
  },
  async listRevisions(env: Env, id: string) { return (await env.OAUTH_KV.list({ prefix: `gw:rev:${id}:`, limit: 50 })).keys.map((k) => k.name.split(":").slice(3).join(":")); },
  async publishingEnabled(env: Env) { return (await env.OAUTH_KV.get("gw:cfg:publishing_disabled")) !== "1"; },
  async setPublishing(env: Env, on: boolean) { if (on) await env.OAUTH_KV.delete("gw:cfg:publishing_disabled"); else await env.OAUTH_KV.put("gw:cfg:publishing_disabled", "1"); },
};

export interface AuditEntry { client: string; user: string; op: string; lesson?: string; ok: boolean; detail?: string; revision?: string }
export const audit = {
  async log(env: Env, e: AuditEntry) {
    const ts = new Date().toISOString();
    const key = `gw:audit:${String(9_999_999_999_999 - Date.now()).padStart(13, "0")}:${crypto.randomUUID().slice(0, 6)}`;
    await env.OAUTH_KV.put(key, JSON.stringify({ ts, ...e, detail: e.detail?.slice(0, 400) }), { expirationTtl: 90 * DAY });
  },
  async recent(env: Env, limit = 30): Promise<any[]> {
    const l = await env.OAUTH_KV.list({ prefix: "gw:audit:", limit: Math.min(limit, 100) });
    return Promise.all(l.keys.map((k) => env.OAUTH_KV.get(k.name, "json")));
  },
};

/** Best-effort fixed-window limiter. KV is eventually consistent, so the limit is approximate; it stops runaway loops, not a determined attacker. */
export async function rateLimit(env: Env, client: string, write: boolean): Promise<void> {
  const limit = write ? 40 : 200, minute = Math.floor(Date.now() / 60000);
  const key = `gw:rl:${client}:${write ? "w" : "r"}:${minute}`;
  const n = Number((await env.OAUTH_KV.get(key)) ?? 0);
  if (n >= limit) throw new Error(`Rate limit: more than ${limit} ${write ? "write" : "read"} calls a minute. Wait and retry.`);
  await env.OAUTH_KV.put(key, String(n + 1), { expirationTtl: 120 });
}

let overlayCache: { at: number; ids: Set<string> } | null = null;
/** Lessons whose text is shown from a rewritten file on the site (public/blog-fixes) instead of the stored text. A database edit does not change what readers see for these. */
export async function overlayIds(env: Env): Promise<Set<string>> {
  if (overlayCache && Date.now() - overlayCache.at < 300_000) return overlayCache.ids;
  try {
    const r = await fetch(`${env.SITE_URL}/blog-fixes/index.json`, { cf: { cacheTtl: 300 } } as RequestInit);
    const j: Record<string, string> = r.ok && (r.headers.get("content-type") ?? "").includes("json") ? await r.json() : {};
    overlayCache = { at: Date.now(), ids: new Set(Object.keys(j)) };
  } catch { overlayCache = { at: Date.now(), ids: new Set() }; }
  return overlayCache.ids;
}

/** The site keeps public reads in an edge cache (up to 3 hours per lesson). After a publish we ask it to forget the lesson. */
export async function purge(env: Env, slug: string): Promise<boolean> {
  if (!env.PURGE_URL || !env.PURGE_KEY) return false;
  try {
    const r = await fetch(`${env.PURGE_URL}/purge?match=${enc(slug)}`, { method: "POST", headers: { "x-purge-key": env.PURGE_KEY } });
    return r.ok;
  } catch { return false; }
}
