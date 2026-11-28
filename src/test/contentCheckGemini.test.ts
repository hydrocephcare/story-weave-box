import { describe, expect, it, vi } from "vitest";
import { askGeminiModel } from "../../supabase/functions/_shared/topicAi.js";
import { checkContent } from "../../supabase/functions/_shared/contentCheck.js";
import { attachDeepReviewEvidence } from "../../supabase/functions/ompath-ai/contentCheck.js";

describe("deep-note clinical review evidence", () => {
  it("attaches the independent Gemini review metadata required by Neon persistence", () => {
    const deep = { sections: [{ h: "Mechanisms" }] };
    const reviewed = attachDeepReviewEvidence(deep, {
      validated: true,
      model: "gemini-3.8-flash",
      at: "2026-11-28",
    });
    expect(reviewed.reviewStatus).toBe("passed");
    expect(reviewed.reviewModel).toBe("gemini-3.8-flash");
    expect(reviewed.reviewedAt).toBe("2026-11-28");
    expect(reviewed.checked).toBe("2026-11-28");
  });

  it("refuses to attach review evidence when the independent check did not pass", () => {
    expect(() => attachDeepReviewEvidence({}, {
      validated: false, model: "gemini-3.8-flash", at: "2026-11-28",
    })).toThrow("cannot be marked reviewed");
    expect(() => attachDeepReviewEvidence({}, {
      validated: true, model: "", at: "2026-11-28",
    })).toThrow("cannot be marked reviewed");
  });
});

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
    expect(fetchImpl.mock.calls[0][0]).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).get("x-goog-api-key")).toBe("gemini-test-key");
    expect(result.model).toBe("gemini-3.8-flash");
  });

  it("surfaces safe Gemini API error details while redacting key-shaped values", async () => {
    const testKey = "AIza" + "A".repeat(32);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: { message: "API key rejected: " + testKey },
    }), { status: 400, headers: { "Content-Type": "application/json" } }));

    await expect(askGeminiModel("Review this medical note", {
      env: { GEMINI_API_KEYS: "gemini-test-key", GEMINI_MODELS: "gemini-3.8-flash" },
      fetchImpl,
    })).rejects.toThrow("Gemini review failed (400): API key rejected: [redacted]");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
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
