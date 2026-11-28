import { describe, expect, it, vi } from "vitest";
import { askGeminiModel, askModel } from "../../supabase/functions/_shared/topicAi.js";

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

  it("keeps the independent clinical reviewer on Gemini when the gateway is unavailable", async () => {
    const envGemini = {
      ...env,
      GEMINI_API_KEYS: '["gemini-review-key"]',
      GROQ_API_KEYS: '["must-not-be-used"]',
    };
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("gateway.example.test")) {
        return new Response(JSON.stringify({ error: "provider_unavailable" }), { status: 503 });
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("gemini-review-key");
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"verdict":"ok","issues":[]}' }] } }],
        }), { status: 200 });
      }
      throw new Error("The independent reviewer must not call Groq.");
    });

    const result = await askGeminiModel("Check this clinical note.", {
      env: envGemini, fetchImpl, timeoutMs: 1000, maxTokens: 200, plain: true, allowDirectFallback: true,
    });

    expect(result.text).toContain('"verdict":"ok"');
    expect(urls.some((url) => url.includes("gateway.example.test"))).toBe(true);
    expect(urls.some((url) => url.includes("generativelanguage.googleapis.com"))).toBe(true);
    expect(urls.some((url) => url.includes("api.groq.com"))).toBe(false);
  });

});
