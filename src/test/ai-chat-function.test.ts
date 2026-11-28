import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "../../functions/api/ai-chat.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Ompath AI chat Pages Function", () => {
  it("normalises a Bearer token and returns a standards-compliant SSE completion", async () => {
    const upstreamFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ text: "Clinical answer." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await onRequest({
      request: new Request("https://ompathstudy.com/api/ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-neon-token",
        },
        body: JSON.stringify({ question: "Explain shock." }),
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const body = await response.text();
    expect(body).toContain('"content":"Clinical answer."');
    expect(body).toContain("data: [DONE]\n\n");
    expect(body).not.toContain("data: [DONE]\\n\\n");

    const init = upstreamFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = new Headers(init?.headers);
    expect(headers.get("x-neon-authorization")).toBe("test-neon-token");
  });

  it("rejects unauthenticated requests without calling the AI gateway", async () => {
    const upstreamFetch = vi.fn();
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await onRequest({
      request: new Request("https://ompathstudy.com/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "Explain shock." }),
      }),
    });

    expect(response.status).toBe(401);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
});
