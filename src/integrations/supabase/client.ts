/** Compatibility export retained while application imports are migrated. PostgREST queries and authentication now run through Neon. */
import { createClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";
import type { Database } from "./types";
import { NEON_AUTH_URL, NEON_DATA_API_URL } from "@/lib/neon-config";

// Cloudflare Pages evaluates server bundles in a restricted global scope.
// Creating the Neon Auth adapter at module load time can trigger async crypto
// work before a request exists, which Cloudflare rejects. Defer client creation
// until the first real application access instead.
type NeonClient = ReturnType<typeof createClient<Database>>;
let neonClient: NeonClient | undefined;
const getNeonClient = (): NeonClient => {
  if (!neonClient) {
    neonClient = createClient<Database>({
      auth: { adapter: SupabaseAuthAdapter(), url: NEON_AUTH_URL, allowAnonymous: true },
      dataApi: { url: NEON_DATA_API_URL },
    });
  }
  return neonClient;
};

type SupabaseCompat = NeonClient & {
  functions: {
    invoke: <T = any>(name: string, options?: { body?: unknown; headers?: Record<string, string> }) => Promise<{ data: T | null; error: Error | null }>;
  };
};

export const supabase = new Proxy({} as SupabaseCompat, {
  get(target, property, receiver) {
    // Keep compatibility helpers attached to the proxy target.
    if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
    const client = getNeonClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

Object.assign(supabase, {
  functions: {
    invoke: async <T = any>(name: string, options?: { body?: unknown; headers?: Record<string, string> }) => {
      const client = getNeonClient();
      const { data: { session } } = await client.auth.getSession();
      const directRoutes: Record<string, string> = {
        "contest-control": "/api/contest-control",
        "google-drive-oauth": "/api/google-drive-oauth",
        "google-drive-import": "/api/google-drive-import",
      };
      const endpoint = directRoutes[name] || `/api/neon-functions?name=${encodeURIComponent(name)}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          ...(options?.headers || {}),
        },
        body: JSON.stringify(options?.body ?? {}),
      });
      const data = await response.json().catch(() => null) as T | null;
      return {
        data: response.ok ? data : null,
        error: response.ok ? null : new Error((data as { error?: string } | null)?.error || `Function ${name} failed (${response.status})`),
      };
    },
  },
});
