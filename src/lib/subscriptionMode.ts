// One master switch for subscriptions, kept in app_settings ("subscriptions_enabled"). Off = everything is free (how the site runs today).
// On = the original rules: prices and plans from the payment settings, Pro features, daily free allowances and the subscribe prompts.
import { useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/store";

const KEY = "subscriptions_enabled";
let on = false;
let loaded = false;
let inflight: Promise<boolean> | null = null;
const listeners = new Set<(on: boolean) => void>();
const emit = () => listeners.forEach((l) => l(on));

export const subscriptionsOn = () => on;
export const onSubscriptionMode = (l: (on: boolean) => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function loadSubscriptionMode(force = false): Promise<boolean> {
  if (loaded && !force) return Promise.resolve(on);
  if (inflight && !force) return inflight;
  inflight = getSetting(KEY)
    .then((v) => { on = v === "true"; })
    .catch(() => { on = false; })
    .then(() => { loaded = true; inflight = null; emit(); return on; });
  return inflight;
}

/** The settings the site shipped with before everything was made free. */
export const ORIGINAL_SUBSCRIPTION_DEFAULTS = {
  access_price_kes: "0",
  reveal_price_kes: "5",
  paywall_free_ratio: "0.25",
  pdf_download_enabled: "true",
  access_plans: JSON.stringify([
    { id: "semester", label: "Aponerosis", price: 150, days: 90, download: true },
    { id: "annual", label: "Annual plan (12 months) — Best Value", price: 400, days: 365, download: true },
  ]),
};

/** Admin only (the database rejects anyone else). Turning on also restores the original prices and Pro features when `restoreDefaults` is set. */
export async function setSubscriptionMode(next: boolean, restoreDefaults = false): Promise<void> {
  if (next && restoreDefaults) {
    for (const [k, v] of Object.entries(ORIGINAL_SUBSCRIPTION_DEFAULTS)) await saveSetting(k, v);
    const { updateSiteConfig } = await import("@/lib/siteConfig");
    await updateSiteConfig((c) => ({ ...c, proFeatures: {} }));
  }
  await saveSetting(KEY, next ? "true" : "false");
  on = next; loaded = true; emit();
  try { (await import("@/lib/access")).resetPaymentSettings(); } catch { /* ignore */ }
}

export function useSubscriptionMode(): boolean {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    void loadSubscriptionMode();
    return () => { listeners.delete(l); };
  }, []);
  return on;
}
