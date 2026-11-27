/** Public Neon endpoints. Override per deployment if the branch changes. */
const env = import.meta.env;
export const NEON_DATA_API_URL = String(env.VITE_NEON_DATA_API_URL || "https://ep-dry-haze-benks3ew.apirest.c-9.us-east-2.aws.neon.tech/neondb/rest/v1").trim();
export const NEON_AUTH_URL = String(env.VITE_NEON_AUTH_URL || "https://ep-dry-haze-benks3ew.neonauth.c-9.us-east-2.aws.neon.tech/neondb/auth").trim();
