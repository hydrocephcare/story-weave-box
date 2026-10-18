import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("@/lib/store", () => ({
  getSetting: async (k: string) => store.get(k) ?? "",
  saveSetting: async (k: string, v: string) => { store.set(k, v); },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) }, functions: { invoke: async () => ({ data: null }) }, from: () => ({}) } }));

import { describe as plan, type AgentWorld } from "@/lib/adminAgent";
import { loadSubscriptionMode, setSubscriptionMode, subscriptionsOn } from "@/lib/subscriptionMode";
import { featureAllowed, tierOf } from "@/lib/features";
import { loadPaymentSettings, resetPaymentSettings } from "@/lib/access";
import * as ai from "@/lib/ompathAi";

beforeEach(async () => { store.clear(); resetPaymentSettings(); await setSubscriptionMode(false); });

describe("subscription master switch", () => {
  it("is off by default: every feature free, no Reveal price", async () => {
    await loadSubscriptionMode(true);
    expect(subscriptionsOn()).toBe(false);
    expect(tierOf("deepNotes", { proFeatures: {} })).toBe("free");
    expect(featureAllowed("deepNotes", { proFeatures: {} }, false)).toBe(true);
    const s = await loadPaymentSettings(true);
    expect(s.revealPrice).toBe(0);
    expect(ai.FREE_DAILY_QUESTIONS).toBeGreaterThan(1_000_000);
  });

  it("switching on restores the original prices, Pro features and daily limits", async () => {
    await setSubscriptionMode(true, true);
    expect(subscriptionsOn()).toBe(true);
    expect(store.get("subscriptions_enabled")).toBe("true");
    expect(store.get("reveal_price_kes")).toBe("5");
    expect(store.get("paywall_free_ratio")).toBe("0.25");
    expect(JSON.parse(store.get("access_plans") || "[]").map((p: { price: number }) => p.price)).toEqual([150, 400]);
    expect(tierOf("deepNotes", { proFeatures: {} })).toBe("pro");
    expect(featureAllowed("deepNotes", { proFeatures: {} }, false)).toBe(false);
    expect(featureAllowed("deepNotes", { proFeatures: {} }, true)).toBe(true);
    expect(featureAllowed("essays", { proFeatures: {} }, false)).toBe(true);   // essays were always free
    const s = await loadPaymentSettings(true);
    expect(s.revealPrice).toBe(5);
    expect(s.freeRatio).toBe(0.25);
    expect(ai.FREE_DAILY_QUESTIONS).toBe(8);
    expect(ai.FREE_DAILY_PICTURES).toBe(15);
    expect(ai.FREE_REVEALS_PER_SUBJECT).toBe(5);
  });

  it("switching off again makes everything free", async () => {
    await setSubscriptionMode(true, true);
    await setSubscriptionMode(false);
    expect(featureAllowed("deepNotes", { proFeatures: {} }, false)).toBe(true);
    expect((await loadPaymentSettings(true)).revealPrice).toBe(0);
    expect(ai.FREE_DAILY_QUESTIONS).toBeGreaterThan(1_000_000);
  });
});

describe("admin assistant: set_subscriptions", () => {
  const world = {} as AgentWorld;
  it("asks for confirmation and describes the original defaults", () => {
    const p = plan([{ tool: "set_subscriptions", args: { mode: "on" } }], world)[0];
    expect(p.ok).toBe(true);
    expect(p.danger).toBe(true);
    expect(p.line).toMatch(/KSh 5/);
    expect(p.line).toMatch(/150/);
  });
  it("rejects an unknown mode and accepts the note MCQ job in job_control", () => {
    expect(plan([{ tool: "set_subscriptions", args: { mode: "maybe" } }], world)[0].ok).toBe(false);
    expect(plan([{ tool: "job_control", args: { job: "note-mcqs", action: "pause" } }], world)[0].ok).toBe(true);
  });
});
