import { describe, expect, it, vi } from "vitest";
import { askGroqModel } from "../../supabase/functions/_shared/topicAi.js";

describe("Groq topic generation boundary", () => {
  it("sends generation requests only to Groq and returns the model used", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({
        choices: [{ message: { content: '{"medical":true}' } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    const result = await askGroqModel("Write a topic page", {
      env: { GROQ_API_KEYS: "groq-test-key", GEMINI_API_KEYS: "gemini-test-key" },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer groq-test-key",
    });
    expect(result).toEqual({ text: '{"medical":true}', model: "openai/gpt-oss-120b" });
  });

  it("does not fall back to Gemini when Groq is not configured", async () => {
    const fetchImpl = vi.fn();

    await expect(
      askGroqModel("Write a topic page", {
        env: { GEMINI_API_KEYS: "gemini-test-key" },
        fetchImpl,
      }),
    ).rejects.toThrow("Groq generation is not configured");

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
