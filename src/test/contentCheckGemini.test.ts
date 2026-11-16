import { describe, expect, it, vi } from "vitest";
import { askGeminiModel } from "../../supabase/functions/_shared/topicAi.js";
import { checkContent } from "../../supabase/functions/_shared/contentCheck.js";

describe("Gemini clinical review boundary", () => {
  it("calls Google's Gemini API directly even when Groq credentials are present", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"verdict":"ok","issues":[]}' }] } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    const result = await askGeminiModel("Review this medical note", {
      env: { GEMINI_API_KEYS: "gemini-test-key", GROQ_API_KEYS: "groq-test-key" },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).get("x-goog-api-key")).toBe("gemini-test-key");
    expect(result.model).toBe("gemini-2.5-flash");
  });

  it("does not use Groq when Gemini review credentials are missing", async () => {
    const fetchImpl = vi.fn();

    await expect(
      askGeminiModel("Review this medical note", {
        env: { GROQ_API_KEYS: "groq-test-key" },
        fetchImpl,
      }),
    ).rejects.toThrow("Gemini review is not configured");

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("routes content checks through the Gemini-only reviewer", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"verdict":"ok","issues":[]}' }] } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    const result = await checkContent({
      title: "Asthma",
      text: "Asthma is a chronic inflammatory airway disease.",
      env: { GEMINI_API_KEYS: "gemini-test-key", GROQ_API_KEYS: "groq-test-key" },
      fetchImpl,
    });

    expect(result.validated).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toContain("generativelanguage.googleapis.com");
  });
});
