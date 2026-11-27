import { createRemoteJWKSet, jwtVerify } from "jose";

const AUTH_JWKS_URL = process.env.NEON_AUTH_JWKS_URL
  || "https://ep-dry-haze-benks3ew.neonauth.c-9.us-east-2.aws.neon.tech/neondb/auth/.well-known/jwks.json";
const DATA_API_URL = String(process.env.NEON_DATA_API_URL || process.env.VITE_NEON_DATA_API_URL
  || "https://ep-dry-haze-benks3ew.apirest.c-9.us-east-2.aws.neon.tech/neondb/rest/v1").replace(/\/+$/, "");
const jwks = createRemoteJWKSet(new URL(AUTH_JWKS_URL));

/**
 * Validate Neon Auth access tokens and consume the central entitlement RPC
 * through the Neon Data API. Do not fall back to the retired Supabase project:
 * that accepts neither the migrated Neon JWTs nor the current database.
 */
export async function consumeEntitlement(req, feature) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { allowed: false, status: 401, reason: "login_required" };

  let claims;
  try {
    const verified = await jwtVerify(token, jwks);
    claims = verified.payload;
    if (!claims.sub || !/^[0-9a-f-]{36}$/i.test(String(claims.sub))) {
      return { allowed: false, status: 401, reason: "invalid_session" };
    }
  } catch {
    return { allowed: false, status: 401, reason: "invalid_session" };
  }

  try {
    const response = await fetch(`${DATA_API_URL}/rpc/consume_feature`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ p_feature: feature, p_units: 1 }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 401 || response.status === 403) {
      return { allowed: false, status: 401, reason: "invalid_session" };
    }
    if (!response.ok) {
      return { allowed: false, status: 503, reason: "verification_unavailable" };
    }
    const result = await response.json();
    return { ...result, status: result.allowed ? 200 : result.reason === "login_required" ? 401 : 402 };
  } catch {
    return { allowed: false, status: 503, reason: "verification_unavailable" };
  }
}
