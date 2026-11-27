import { createRemoteJWKSet, jwtVerify } from "jose";

const DEFAULT_JWKS = "https://ep-dry-haze-benks3ew.neonauth.c-9.us-east-2.aws.neon.tech/neondb/auth/.well-known/jwks.json";
const DEFAULT_DATA_API = "https://ep-dry-haze-benks3ew.apirest.c-9.us-east-2.aws.neon.tech/neondb/rest/v1";

export async function isNeonAdmin(token) {
  const bearer = String(token || "").replace(/^Bearer\\s+/i, "").trim();
  if (!bearer) return false;
  try {
    const jwks = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL || DEFAULT_JWKS));
    const verified = await jwtVerify(bearer, jwks);
    const id = String(verified.payload?.sub || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
    const base = String(process.env.NEON_DATA_API_URL || process.env.VITE_NEON_DATA_API_URL || DEFAULT_DATA_API).replace(/\\/+$/, "");
    const response = await fetch(base + "/rpc/has_role", {
      method: "POST",
      headers: { Authorization: "Bearer " + bearer, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ _user_id: id, _role: "admin" }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return false;
    return (await response.json()) === true;
  } catch {
    return false;
  }
}
