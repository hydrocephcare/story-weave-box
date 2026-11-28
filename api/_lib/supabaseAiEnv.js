const AI_URL = "https://rcntjfzivtnijnkliouc.supabase.co/functions/v1/ompath-ai";
const AI_PUBLISHABLE_KEY = "sb_publishable_HdlAHkp2wXjRCYqWLnPckw_dOUcjEVP";

/** Build a per-request AI environment without ever copying provider secrets to the browser. */
export function supabaseAiEnv(req, { feature = "", workflow = false, base = process.env } = {}) {
  const headers = req?.headers || {};
  const raw = String(workflow ? (headers["x-github-oidc"] || headers.authorization || "") : (headers["x-neon-authorization"] || headers.authorization || ""));
  const token = raw.replace(/^Bearer\\s+/i, "").trim();
  return {
    ...base,
    OMPATH_SUPABASE_AI_URL: AI_URL,
    OMPATH_SUPABASE_AI_PUBLISHABLE_KEY: AI_PUBLISHABLE_KEY,
    OMPATH_SUPABASE_AI_TOKEN: token,
    OMPATH_SUPABASE_AI_AUTH_KIND: workflow ? "github" : "neon",
    OMPATH_AI_FEATURE: feature,
  };
}
