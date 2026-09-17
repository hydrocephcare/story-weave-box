/**
 * OmniRoute client for Supabase edge functions.
 *
 * Routes chat-completion traffic through a configured OmniRoute gateway
 * (OpenAI-compatible POST {base}/v1/chat/completions) using a combo ID as the
 * model field — e.g. "ompathstudy", which round-robins free gemini providers.
 *
 * When the gateway is not configured (no OMNIROUTE_BASE_URL / OMNIROUTE_API_KEY
 * secrets) or a call fails, callers fall back to their own provider logic
 * (direct Gemini / Lovable) so existing behaviour is preserved.
 */

export interface OmniRouteConfig {
  base: string;
  key: string;
  model: string;
}

/** Returns the active gateway config, or null when not configured. */
export function omniRouteConfig(): OmniRouteConfig | null {
  const base = (Deno.env.get("OMNIROUTE_BASE_URL") || "").trim();
  const key = (Deno.env.get("OMNIROUTE_API_KEY") || "").trim();
  if (!base || !key) return null;
  return {
    base: base.replace(/\/+$/, ""),
    key,
    model: (Deno.env.get("OMNIROUTE_MODEL") || "").trim() || "ompathstudy",
  };
}

/** True when the gateway secrets are present (used to relax Gemini-key guards). */
export function omniRouteConfigured(): boolean {
  return omniRouteConfig() !== null;
}

/** Normalise a base URL into a chat-completions URL without double-adding /v1. */
export function chatCompletionsUrl(base: string): string {
  const b = base.replace(/\/+$/, "");
  return /\/v1$/.test(b) ? `${b}/chat/completions` : `${b}/v1/chat/completions`;
}

export interface OmniRouteCallOptions {
  messages: Array<{ role: string; content: unknown }>;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * Perform a chat-completions call through the gateway and return the assistant
 * text. Throws on any non-2xx response or empty/absent content so callers can
 * fall back to their next provider.
 */
export async function callOmniRoute(
  cfg: OmniRouteConfig,
  opts: OmniRouteCallOptions,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60000);
  try {
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages: opts.messages,
      // OmniRoute streams by default for several providers; force a plain JSON
      // response so we can parse the assistant text directly.
      stream: false,
    };
    if (typeof opts.temperature === "number") body.temperature = opts.temperature;
    if (typeof opts.maxTokens === "number") body.max_tokens = opts.maxTokens;

    const res = await fetch(chatCompletionsUrl(cfg.base), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.key}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`OmniRoute error (${res.status}): ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("OmniRoute returned an empty response");
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}
