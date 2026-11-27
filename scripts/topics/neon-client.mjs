import { createClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";

export function createTopicDataClient() {
  const authUrl = process.env.NEON_AUTH_URL || process.env.VITE_NEON_AUTH_URL;
  const dataApiUrl = process.env.NEON_DATA_API_URL || process.env.VITE_NEON_DATA_API_URL;
  const polishKey = process.env.POLISH_WRITE_KEY;
  if (!authUrl || !dataApiUrl) throw new Error("NEON_AUTH_URL and NEON_DATA_API_URL are required.");
  if (!polishKey) throw new Error("POLISH_WRITE_KEY GitHub Actions secret is required for topic maintenance writes.");

  return createClient({
    auth: { adapter: SupabaseAuthAdapter(), url: authUrl, allowAnonymous: true },
    dataApi: {
      url: dataApiUrl,
      options: { global: { headers: { "x-polish-key": polishKey } } },
    },
  });
}
