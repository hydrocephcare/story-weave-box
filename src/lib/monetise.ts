// Ways the site can pay for itself. Everything is OFF until the admin switches it on (src/pages/AdminMonetise.tsx), stored in app_settings
// under "monetise". Subscribers and the admin never see ads. Nothing here ever appears in exams or quizzes.
import { useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/store";

export interface Affiliate { id: string; title: string; url: string; label: string; keywords: string }
export interface MonetiseConfig {
  ads: { enabled: boolean; client: string; slot: string };
  sponsor: { enabled: boolean; name: string; url: string; line: string };
  affiliates: Affiliate[];
}
export const DEFAULT_MONETISE: MonetiseConfig = { ads: { enabled: false, client: "", slot: "" }, sponsor: { enabled: false, name: "", url: "", line: "" }, affiliates: [] };

const KEY = "monetise";
let cache: MonetiseConfig | null = null;
let inflight: Promise<MonetiseConfig> | null = null;
const listeners = new Set<() => void>();

const clean = (raw: unknown): MonetiseConfig => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<MonetiseConfig>;
  return {
    ads: { ...DEFAULT_MONETISE.ads, ...(r.ads ?? {}) },
    sponsor: { ...DEFAULT_MONETISE.sponsor, ...(r.sponsor ?? {}) },
    affiliates: Array.isArray(r.affiliates) ? r.affiliates.filter((a) => a && a.url && /^https:\/\//.test(a.url)) : [],
  };
};

export function loadMonetise(force = false): Promise<MonetiseConfig> {
  if (cache && !force) return Promise.resolve(cache);
  if (inflight && !force) return inflight;
  inflight = getSetting(KEY).then((t) => { cache = t ? clean(JSON.parse(t)) : DEFAULT_MONETISE; }).catch(() => { cache = DEFAULT_MONETISE; }).then(() => { inflight = null; listeners.forEach((l) => l()); return cache as MonetiseConfig; });
  return inflight;
}
export async function saveMonetise(c: MonetiseConfig) { await saveSetting(KEY, JSON.stringify(clean(c))); cache = clean(c); listeners.forEach((l) => l()); }

export function useMonetise(): MonetiseConfig {
  const [c, setC] = useState<MonetiseConfig>(cache ?? DEFAULT_MONETISE);
  useEffect(() => { let on = true; const sync = () => on && setC(cache ?? DEFAULT_MONETISE); listeners.add(sync); void loadMonetise().then(sync); return () => { on = false; listeners.delete(sync); }; }, []);
  return c;
}

/** Books and courses that fit a page, matched on the words an admin gave each one. */
export function affiliatesFor(list: Affiliate[], pageText: string): Affiliate[] {
  const t = pageText.toLowerCase();
  return list.filter((a) => a.keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean).some((k) => t.includes(k))).slice(0, 3);
}
