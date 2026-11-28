import { describe, expect, it, vi } from "vitest";
import { askModel } from "../../supabase/functions/_shared/topicAi.js";

const env = {
  OMPATH_SUPABASE_AI_URL: "https://gateway.example.test/functions/v1/ompath-ai",
  OMPATH_SUPABASE_AI_TOKEN: "header.payload.signature",
  OMPATH_SUPABASE_AI_AUTH_KIND: "github",
  GROQ_API_KEYS: '["groq-test-key"]',
  GROQ_MODELS: "openai/gpt-oss-20b",
  GEMINI_API_KEYS: "",
  GEMINI_API_KEY: "",
};

describe("shared AI gateway fallback", () => {
  it("uses direct Groq only when an explicitly trusted caller enables fallback", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("gateway.example.test")) {
        return new Response(JSON.stringify({ error: "provider_unavailable" }), { status: 503 });
      }
      if (url.includes("api.groq.com")) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: "Draft generated." } }],
        }), { status: 200 });
      }
      throw new Error("Unexpected provider URL");
    });

    const result = await askModel("Write a concise medical study note.", {
      env, fetchImpl, timeoutMs: 1000, maxTokens: 200, plain: true, allowDirectFallback: true,
    });

    expect(result.text).toBe("Draft generated.");
    expect(urls.some((url) => url.includes("gateway.example.test"))).toBe(true);
    expect(urls.some((url) => url.includes("api.groq.com"))).toBe(true);
  });

  it("does not bypass the central gateway for callers that did not opt in", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      return new Response(JSON.stringify({ error: "provider_unavailable" }), { status: 503 });
    });

    await expect(askModel("Generate an answer.", {
      env, fetchImpl, timeoutMs: 1000, maxTokens: 200, plain: true,
    })).rejects.toThrow();

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("gateway.example.test");
  });
});
