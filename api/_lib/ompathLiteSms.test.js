import { afterEach, describe, expect, it, vi } from "vitest";
import { sendHealthGuideLink } from "./ompathLiteSms.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("private patient-guide SMS consent and link validation", () => {
  it("accepts only the deployed Lite guide route and never sends in sandbox", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-only-test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{
      enabled: false,
      environment: "sandbox",
      sender_id: null,
    }]), { status: 200 })));
    const token = "A".repeat(43);
    const result = await sendHealthGuideLink({
      to: "+254712345678",
      link: "https://lite.ompathstudy.com/api/lite?task=health-guide&token=" + token + "&welcome=1",
      smsConsent: true,
    });
    expect(result).toEqual({ sent: false, reason: "sms_not_live" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects the obsolete route and missing consent before any provider call", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(sendHealthGuideLink({
      to: "+254712345678",
      link: "https://lite.ompathstudy.com/api/ompath-lite-guide?token=" + "A".repeat(43),
      smsConsent: true,
    })).rejects.toThrow("Invalid private guide delivery details");
    await expect(sendHealthGuideLink({
      to: "+254712345678",
      link: "https://lite.ompathstudy.com/api/lite?task=health-guide&token=" + "A".repeat(43) + "&welcome=1",
      smsConsent: false,
    })).rejects.toThrow("Explicit SMS consent is required");
    expect(fetch).not.toHaveBeenCalled();
  });
});
