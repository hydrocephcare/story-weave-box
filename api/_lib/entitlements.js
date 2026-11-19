const SUPABASE_URL = "https://strfwaqvxvkhjbqrwmla.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdHJmd2Fxdnh2a2hqYnFyd21sYSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzkyNzEyMDcxLCJleHAiOjIxMDgyODgwNzF9.F_bGNSKsC6Wbriit19-OIwNdScqAUU0yhJ3TtQuiTkE";

/** Validate the caller's Supabase session and atomically consume a free feature allowance. */
export async function consumeEntitlement(req, feature) {
  const auth = String(req.headers.authorization || "");
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { allowed: false, status: 401, reason: "login_required" };
  const user = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!user.ok) return { allowed: false, status: 401, reason: "invalid_session" };
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_feature`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_feature: feature, p_units: 1 }),
  });
  if (!response.ok) return { allowed: false, status: 503, reason: "verification_unavailable" };
  const result = await response.json();
  return { ...result, status: result.allowed ? 200 : result.reason === "login_required" ? 401 : 402 };
}
