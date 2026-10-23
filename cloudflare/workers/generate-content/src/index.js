// Cloudflare Worker version of the Supabase function generate-content: same request body and response, plus an admin check.
import { run } from "./shim.js";
import "./function.ts";

const cors = (env, req) => {
  const o = req.headers.get("Origin") || "";
  return { "Access-Control-Allow-Origin": String(env.ALLOWED_ORIGINS || "").split(",").includes(o) ? o : "null", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", Vary: "Origin" };
};
export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(env, req) });
    const deny = (status, error) => new Response(JSON.stringify({ error }), { status, headers: { ...cors(env, req), "Content-Type": "application/json" } });
    const auth = req.headers.get("Authorization") || "", apikey = req.headers.get("apikey") || "";
    const who = await fetch(`${env.AUTH_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey } });
    if (!auth.startsWith("Bearer ") || !who.ok) return deny(401, "Sign in first.");
    const user = await who.json();
    const adm = await fetch(`${env.AUTH_URL}/rest/v1/rpc/has_role`, { method: "POST", headers: { Authorization: auth, apikey, "Content-Type": "application/json" }, body: JSON.stringify({ _user_id: user.id, _role: "admin" }) });
    if (!adm.ok || (await adm.json()) !== true) return deny(403, "Admin access required.");
    const res = await run(req, env);
    const h = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors(env, req))) h.set(k, v);
    return new Response(res.body, { status: res.status, headers: h });
  },
};
