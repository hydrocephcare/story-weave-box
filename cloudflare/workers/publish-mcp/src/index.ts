// OmpathStudy publishing gateway: one remote MCP endpoint (/mcp) for ChatGPT, Claude and any other MCP client.
//   /mcp                       the tools (Streamable HTTP, stateless). Needs an OAuth access token.
//   /authorize /token /register   OAuth 2.1 with PKCE and dynamic client registration (@cloudflare/workers-oauth-provider)
//   /.well-known/*             discovery metadata (served by the provider)
//   /upload/<signed-token>     one-shot image upload for assistants that cannot send bytes through a tool call
// Signing in to authorize an assistant needs the OmpathStudy ADMIN account: the password is checked against the site's own sign-in and the
// admin role is checked; the password is never stored.
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "agents/mcp/server";
import { buildServer } from "./tools";
import { checkUploadToken, storeImage, MAX_IMAGE_BYTES } from "./lib/images";
import { audit, SCOPES, type Env, type Props } from "./lib/platform";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const mcp = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext & { props?: Props }) {
    const props = ctx.props as Props;
    const handler = createMcpHandler(() => buildServer(env, props, new URL(request.url).origin), { route: "/mcp", corsOptions: false, authContext: { props } });
    return handler(request, env, ctx);
  },
};

function page(title: string, body: string, status = 200, headers?: Headers) {
  const h = new Headers(headers);
  h.set("Content-Type", "text/html; charset=utf-8");
  h.set("Cache-Control", "no-store");
  h.set("X-Frame-Options", "DENY");
  h.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#0f1a1c;color:#e8f0ef;margin:0;display:grid;place-items:center;min-height:100vh;padding:16px}
main{background:#16262a;border:1px solid #28454b;border-radius:14px;max-width:460px;width:100%;padding:24px}h1{font-size:1.25rem;margin:0 0 4px}
p{color:#a9c0be;margin:8px 0}label{display:block;margin:12px 0 4px;font-weight:600}input[type=email],input[type=password]{width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #3a5a60;background:#0f1a1c;color:#fff}
.scope{display:flex;gap:10px;align-items:flex-start;margin:8px 0}.scope small{display:block;color:#a9c0be}button{margin-top:16px;padding:10px 16px;border-radius:8px;border:0;font-weight:700;cursor:pointer}
.ok{background:#2fb8a5;color:#052b27}.no{background:transparent;color:#a9c0be;border:1px solid #3a5a60;margin-left:8px}.err{background:#4a1f24;border:1px solid #8a3a44;padding:10px;border-radius:8px;margin:12px 0}</style></head><body><main>${body}</main></body></html>`, { status, headers: h });
}

async function adminLogin(env: Env, email: string, password: string): Promise<{ userId: string; email: string } | string> {
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: env.SUPABASE_ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
  });
  if (!r.ok) return "Wrong email or password.";
  const s: any = await r.json();
  const role = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/has_role`, {
    method: "POST", headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${s.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ _user_id: s.user.id, _role: "admin" }),
  });
  if (!role.ok || (await role.json()) !== true) return "This account is not an OmpathStudy admin.";
  return { userId: s.user.id, email: s.user.email };
}

// Failed sign-ins only: six wrong passwords from one address in ten minutes locks that address out for the rest of the window.
const loginKey = (ip: string) => `gw:login2:${ip}:${Math.floor(Date.now() / 600000)}`;
async function tooManyTries(env: Env, ip: string): Promise<boolean> { return Number((await env.OAUTH_KV.get(loginKey(ip))) ?? 0) >= 6; }
async function recordFailure(env: Env, ip: string) { const k = loginKey(ip); await env.OAUTH_KV.put(k, String(Number((await env.OAUTH_KV.get(k)) ?? 0) + 1), { expirationTtl: 900 }); }

const consentForm = async (env: Env, request: Request, error = "") => {
  const oauth = env.OAUTH_PROVIDER;
  const authReq = await oauth.parseAuthRequest(request);
  const d = await oauth.describeConsent(authReq);
  const tx = await oauth.beginConsent(authReq);
  const wanted: string[] = d.scope.length ? d.scope.filter((s: string) => s in SCOPES) : ["lessons:read"];
  const boxes = Object.entries(SCOPES).map(([k, v]) => `<label class="scope"><input type="checkbox" name="scope" value="${k}" ${wanted.includes(k) ? "checked" : ""} ${k === "admin" || k === "lessons:publish" ? "" : ""}><span>${esc(k)}<small>${esc(v)}</small></span></label>`).join("");
  return page("Authorize assistant", `<h1>Let “${esc(d.clientName)}” use OmpathStudy publishing?</h1>
<p>${d.clientDomain ? `Verified domain: <b>${esc(d.clientDomain)}</b>. ` : ""}It will be sent to <b>${esc(d.redirectHost)}</b>${d.redirectIsLoopback ? " (an app on this computer)" : ""}.</p>
${error ? `<div class="err">${esc(error)}</div>` : ""}
<form method="post"><input type="hidden" name="handle" value="${esc(tx.handle)}"><input type="hidden" name="oauth" value="${esc(new URL(request.url).search)}">
<p>Tick only what this assistant needs. Nothing goes live without a separate publish step.</p>${boxes}
<label>OmpathStudy admin email</label><input type="email" name="email" autocomplete="username" required>
<label>Password</label><input type="password" name="password" autocomplete="current-password" required>
<button class="ok" name="decision" value="approve">Authorize</button><button class="no" name="decision" value="deny" formnovalidate>Cancel</button></form>
<p><small>You can revoke this assistant at any time. Your password is checked with the site and not stored.</small></p>`, 200, tx.headers);
};

const authHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const oauth = env.OAUTH_PROVIDER;

    if (url.pathname === "/authorize") {
      try {
        if (request.method === "GET") return await consentForm(env, request);
        const form = await request.formData();
        const handle = String(form.get("handle") ?? "");
        if (!handle) return page("Cannot authorize", "<h1>Cannot authorize</h1><div class=\"err\">The consent session is missing. Start again.</div>", 400);

        // Make a completed consent POST safe to retry. The provider's consent handle is
        // single-use; browsers can nevertheless resend a POST after receiving its redirect.
        // Store only a short-lived redirect, keyed by a digest of the unguessable handle and
        // bound to this exact OAuth request, decision and selected scopes. The code itself
        // remains single-use and PKCE-protected by the OAuth provider.
        const sha256 = async (value: string) => {
          const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
          return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
        };
        const decision = String(form.get("decision") ?? "approve");
        const selectedScopes = (form.getAll("scope") as string[]).filter((s) => s in SCOPES).sort();
        const fingerprint = await sha256([
          url.searchParams.get("client_id") ?? "",
          url.searchParams.get("redirect_uri") ?? "",
          url.searchParams.get("state") ?? "",
          decision,
          selectedScopes.join(" "),
        ].join("\\n"));
        const replayKey = `gw:consent-replay:${await sha256(handle)}`;
        const replay = await env.OAUTH_KV.get<{ fingerprint: string; redirectTo: string }>(replayKey, "json");
        if (replay?.fingerprint === fingerprint) {
          return new Response(null, { status: 302, headers: { Location: replay.redirectTo, "Cache-Control": "no-store" } });
        }

        // the OAuth parameters are on the query string of the form's action (same URL), so parse from the request
        if (decision === "deny") {
          const denied = await oauth.denyConsent(request, handle);
          await env.OAUTH_KV.put(replayKey, JSON.stringify({ fingerprint, redirectTo: denied.redirectTo }), { expirationTtl: 120 });
          const h = new Headers(denied.headers); h.set("Location", denied.redirectTo);
          return new Response(null, { status: 302, headers: h });
        }
        const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
        if (await tooManyTries(env, ip)) return page("Too many tries", `<h1>Too many attempts</h1><p>Wait ten minutes and try again.</p>`, 429);
        const who = await adminLogin(env, String(form.get("email") ?? "").trim(), String(form.get("password") ?? ""));
        if (typeof who === "string") { await recordFailure(env, ip); return await consentForm(env, request, who); }
        const scope = (form.getAll("scope") as string[]).filter((s) => s in SCOPES);
        if (!scope.length) return await consentForm(env, request, "Tick at least one permission.");
        const approved = await oauth.approveConsent(request, handle, { scope });
        const client = await oauth.lookupClient(approved.request.clientId);
        const done = await oauth.completeAuthorization({
          request: approved.request, userId: who.userId, scope, metadata: { email: who.email },
          props: { userId: who.userId, email: who.email, clientId: approved.request.clientId, clientName: client?.clientName ?? approved.request.clientId, scope } satisfies Props,
        });
        await env.OAUTH_KV.put(replayKey, JSON.stringify({ fingerprint, redirectTo: done.redirectTo }), { expirationTtl: 120 });
        await audit.log(env, { client: client?.clientName ?? approved.request.clientId, user: who.email, op: "authorize_client", ok: true, detail: scope.join(" ") });
        const h = new Headers(approved.headers); h.set("Location", done.redirectTo);
        return new Response(null, { status: 302, headers: h });
      } catch (e: any) {
        return page("Cannot authorize", `<h1>Cannot authorize</h1><div class="err">${esc(e?.message ?? "Invalid request")}</div>`, 400);
      }
    }

    const up = /^\/upload\/([^/]+)$/.exec(url.pathname);
    if (up) {
      if (request.method !== "PUT" && request.method !== "POST") return json({ error: "PUT or POST the image bytes." }, 405);
      const t = await checkUploadToken(env.UPLOAD_SIGNING_SECRET, decodeURIComponent(up[1]));
      if (!t) return json({ error: "This upload link is invalid or has expired." }, 401);
      if (await env.OAUTH_KV.get(`gw:used:${t.nonce}`)) return json({ error: "This upload link was already used." }, 409);
      const len = Number(request.headers.get("content-length") ?? 0);
      if (len > MAX_IMAGE_BYTES) return json({ error: "Image too large." }, 413);
      try {
        const bytes = new Uint8Array(await request.arrayBuffer());
        const out = await storeImage(env, bytes, url.searchParams.get("name") ?? "image", { by: t.by });
        await env.OAUTH_KV.put(`gw:used:${t.nonce}`, "1", { expirationTtl: 3600 });
        await audit.log(env, { client: t.by, user: "upload-link", op: "upload_via_link", ok: true, detail: out.key });
        return json(out);
      } catch (e: any) { return json({ error: e.message }, 400); }
    }

    if (url.pathname === "/" || url.pathname === "/health") return json({ service: "ompathstudy-publishing-gateway", mcp: `${url.origin}/mcp`, status: "ok" });
    return json({ error: "not found" }, 404);
  },
};

// The provider is built per request because the canonical addresses (resource and issuer) are this Worker's own origin, which differs between
// workers.dev and the custom domain.
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const origin = new URL(request.url).origin;
    return new OAuthProvider<Env>({
      apiRoute: "/mcp",
      apiHandler: mcp as any,
      defaultHandler: authHandler as any,
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/token",
      clientRegistrationEndpoint: "/register",
      scopesSupported: Object.keys(SCOPES),
      accessTokenTTL: 3600,
      resourceMetadata: { resource: origin + "/mcp", authorization_servers: [origin], scopes_supported: Object.keys(SCOPES), resource_name: "OmpathStudy publishing" },
    }).fetch(request, env, ctx);
  },
};
