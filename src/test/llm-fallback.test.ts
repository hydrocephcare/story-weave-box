import { afterEach, describe, expect, it, vi } from "vitest";
import { askJson } from "../../api/_lib/llm.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("admin AI provider resilience", () => {
  it("falls back from the Supabase gateway and rotates through JSON-array Groq keys", async () => {
    vi.stubEnv("GROQ_API_KEYS", '["bad-key","working-key"]');
    vi.stubEnv("GROQ_CHAT_MODELS", "openai/gpt-oss-20b");
    vi.stubEnv("GEMINI_API_KEYS", "");
    vi.stubEnv("GEMINI_API_KEY", "");

    const calls: Array<{ url: string; authorization: string | null }> = [];
    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const authorization = new Headers(init?.headers).get("Authorization");
      calls.push({ url, authorization });
      if (url.includes(".supabase.co/functions/v1/ompath-ai")) {
        return new Response(JSON.stringify({ error: "provider_unavailable" }), { status: 503 });
      }
      if (url.includes("api.groq.com")) {
        if (authorization === "Bearer bad-key") {
          return new Response(JSON.stringify({ error: "invalid key" }), { status: 401 });
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });
      }
      throw new Error("Unexpected provider URL");
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await askJson([
      { role: "system", content: "Return JSON only." },
      { role: "user", content: "Test the provider fallback." },
    ], { authToken: "header.payload.signature", fast: true, maxTokens: 200 });

    expect(result.text).toBe('{"ok":true}');
    expect(calls.some((call) => call.url.includes(".supabase.co/functions/v1/ompath-ai"))).toBe(true);
    expect(calls.some((call) => call.authorization === "Bearer bad-key")).toBe(true);
    expect(calls.some((call) => call.authorization === "Bearer working-key")).toBe(true);
  });
});
