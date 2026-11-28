import { describe, expect, it, vi } from "vitest";
import { postJsonPreservingRedirect } from "../../supabase/functions/_shared/postJson.js";

describe("publishing workflow POST redirects", () => {
  it("preserves POST and authorization across a same-site canonical-host redirect", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 301,
        headers: { Location: "https://ompathstudy.com/api/neon-functions?name=blog-polish-queue" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, articles: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));

    const result = await postJsonPreservingRedirect(
      "https://www.ompathstudy.com/api/neon-functions?name=blog-polish-queue",
      { count: 4 },
      { Authorization: "Bearer test-oidc-token", "Content-Type": "application/json" },
      1000,
      fetchImpl,
    );

    expect(result.response.status).toBe(200);
    expect(result.data.success).toBe(true);
    expect(result.redirects).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0].toString()).toBe("https://ompathstudy.com/api/neon-functions?name=blog-polish-queue");
    expect(fetchImpl.mock.calls[1][1].method).toBe("POST");
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe("Bearer test-oidc-token");
    expect(fetchImpl.mock.calls[1][1].body).toBe(JSON.stringify({ count: 4 }));
  });

  it("supports a configured HTTPS staging host without weakening redirect checks", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    const result = await postJsonPreservingRedirect(
      "https://preview.ompathstudy.test/api/neon-functions?name=topic-maintenance",
      { task: "health" },
      { Authorization: "Bearer staging-test-token" },
      1000,
      fetchImpl,
    );
    expect(result.response.status).toBe(200);
    expect(result.data.success).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1].method).toBe("POST");
  });

  it("refuses to forward the workflow token to an external redirect target", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { Location: "https://attacker.example/collect" },
    }));

    await expect(postJsonPreservingRedirect(
      "https://www.ompathstudy.com/api/neon-functions?name=blog-polish-queue",
      { count: 4 },
      { Authorization: "Bearer test-oidc-token" },
      1000,
      fetchImpl,
    )).rejects.toThrow("approved same-site endpoint");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
