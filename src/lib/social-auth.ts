import { supabase } from "@/integrations/supabase/client";

/** Canonical public origin used for OAuth redirects (production must be the .com domain). */
export function canonicalOrigin(): string {
  if (typeof window === "undefined") return "https://www.ompathstudy.com";
  const host = window.location.hostname;
  if (host.endsWith("ompathstudy.com")) return "https://www.ompathstudy.com";
  return window.location.origin;
}

/** Accept only an internal path after OAuth; never preserve an external URL. */
export function safePostLoginPath(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/account";
}

/**
 * Google sign-in for students, so subscriptions can be tied to an account.
 * Uses a plain full-page redirect (works on Vercel and inside the preview).
 */
export async function signInWithGoogle(): Promise<{ redirected?: boolean; error?: string }> {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${canonicalOrigin()}/auth/callback`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) return { error: error.message };
    return { redirected: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Google sign-in failed" };
  }
}
