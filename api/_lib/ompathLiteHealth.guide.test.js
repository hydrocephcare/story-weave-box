import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createHealthGuideToken, getHealthGuideToken } from "./ompathLiteHealth.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("private patient guide bearer tokens", () => {
  it("stores only a SHA-256 digest and resolves a valid unexpired token", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-only-test-key");
    const calls = [];
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (options.method === "POST") {
        const body = JSON.parse(options.body);
        expect(body.token_hash).toMatch(/^[a-f0-9]{64}$/);
        expect(body.token_hash).not.toContain("undefined");
        expect(body.resource_slug).toBe("pregnancy-warning-signs");
        return new Response(JSON.stringify([{ id: "token-row" }]), { status: 201 });
      }
      if (options.method === "PATCH") return new Response(JSON.stringify([{ id: "token-row" }]), { status: 200 });
      return new Response(JSON.stringify([{
        id: "token-row",
        resource_slug: "pregnancy-warning-signs",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        revoked_at: null,
      }]), { status: 200 });
    }));

    const issued = await createHealthGuideToken({
      encounterId: "11111111-1111-4111-8111-111111111111",
      resourceSlug: "pregnancy-warning-signs",
    });
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{40,60}$/);
    const resolved = await getHealthGuideToken(issued.token);
    expect(resolved.resource_slug).toBe("pregnancy-warning-signs");
    expect(calls).toHaveLength(3);
    expect(calls[0].options.body).not.toContain(issued.token);
    expect(calls[1].url).toContain(createHash("sha256").update(issued.token).digest("hex"));
  });

  it("rejects malformed bearer tokens without querying storage", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect(await getHealthGuideToken("not-a-token")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
