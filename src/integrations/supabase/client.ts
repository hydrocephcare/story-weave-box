/** Compatibility export retained while application imports are migrated. PostgREST queries and authentication now run through Neon. */
import { createClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";
import type { Database } from "./types";
import { NEON_AUTH_URL, NEON_DATA_API_URL } from "@/lib/neon-config";
const neonClient = createClient<Database>({ auth: { adapter: SupabaseAuthAdapter(), url: NEON_AUTH_URL, allowAnonymous: true }, dataApi: { url: NEON_DATA_API_URL } });
export const supabase = Object.assign(neonClient, { functions: { invoke: async <T = any>(name: string, options?: { body?: unknown; headers?: Record<string, string> }) => {
  const { data: { session } } = await neonClient.auth.getSession();
  const response = await fetch(`/api/neon-functions?name=${encodeURIComponent(name)}`, { method: "POST", headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}), ...(options?.headers || {}) }, body: JSON.stringify(options?.body ?? {}) });
  const data = await response.json().catch(() => null) as T | null;
  return { data: response.ok ? data : null, error: response.ok ? null : new Error((data as { error?: string } | null)?.error || `Function ${name} failed (${response.status})`) };
} } });
