import { afterEach, describe, expect, it, vi } from "vitest";
import { createHealthEncounter } from "./ompathLiteHealth.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Lite health encounter persistence", () => {
  it("stores anonymous web encounters and preserves the selected language", async () => {
    const writes = [];
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-only-test-key");
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      if (String(url).includes("?select=")) return new Response("[]", { status: 200 });
      if (options.method === "POST") {
        writes.push(JSON.parse(options.body));
        return new Response(JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111" }]), { status: 201 });
      }
      throw new Error("Unexpected database request");
    }));

    await createHealthEncounter({
      sessionId: "123e4567-e89b-42d3-a456-426614174000",
      phoneNumber: null,
      consentGiven: true,
      preferredLanguage: "sw",
      channel: "web",
    });

    expect(writes).toHaveLength(1);
    expect(writes[0].phone_number).toBeNull();
    expect(writes[0].preferred_language).toBe("sw");
    expect(writes[0].channel).toBe("web");
  });

  it("still requires a valid caller number for USSD", async () => {
    const fetchStub = vi.fn();
    vi.stubGlobal("fetch", fetchStub);
    await expect(createHealthEncounter({
      sessionId: "ATUid_test123",
      phoneNumber: null,
      consentGiven: true,
      preferredLanguage: "en",
      channel: "ussd",
    })).rejects.toThrow("A valid mobile number is required.");
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
