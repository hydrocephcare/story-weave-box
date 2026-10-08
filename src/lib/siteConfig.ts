// Admin-editable site configuration, stored as one JSON value in app_settings ("site_config").
// Everything here has a built-in default, so the site works the same if the setting is missing or unreadable.
import { useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/store";
import { OFFICIAL_2026_SCHEDULES, type OfficialScheduleTable } from "@/lib/timetable2026";

export interface KeyDate { id: string; label: string; date: string } // date = YYYY-MM-DD
export interface Announcement { enabled: boolean; text: string; link: string; tone: "info" | "success" | "warning" }

export interface SiteConfig {
  announcement: Announcement;
  keyDates: KeyDate[];
  /** Admin-edited weekly timetable per year; a year not listed here uses the official one. */
  timetable: Record<string, OfficialScheduleTable[]>;
  /** Unit-code prefix → subject name, e.g. MBHA → "Human Anatomy". */
  unitNames: Record<string, string>;
  /** Library file ids hidden from learners. */
  hiddenFiles: string[];
  /** Library file id → display title. */
  renames: Record<string, string>;
  /** Feature key -> "free" or "pro" (see src/lib/features.ts). A feature not listed uses its built-in default. */
  proFeatures?: Record<string, "free" | "pro">;
}

export const DEFAULT_UNIT_NAMES: Record<string, string> = {
  MBHA: "Human Anatomy", MBMB: "Medical Biochemistry", MBMP: "Medical Physiology", MBMM: "Medical Microbiology",
  MBPA: "Pathology", MBPL: "Pharmacology", MBPE: "Paediatrics & Child Health", MBSG: "General Surgery", MBOG: "Obstetrics & Gynaecology",
  MBIM: "Internal Medicine", MBPS: "Psychiatry & Mental Health", BND: "Nutrition & Dietetics", BMS: "Behavioural Sciences", BUCU: "Communication & ICT Skills",
  MBCS: "Clinical Specialties", MBDS: "Dental Surgery", MBPH: "Public Health", MBHR: "Health Systems & Research",
};

/** "MBHA 1124 Ca · Dissection" → { title: "Human Anatomy", sub: "Dissection · MBHA 1124 Ca" }. Unknown codes are left as they are. */
export function formatUnitEntry(entry: string, names: Record<string, string>): { title: string; sub: string } {
  const [head, ...rest] = entry.split(" · ");
  const m = head.match(/^([A-Z]{3,4})\s?\d{3,4}/);
  const name = m ? names[m[1]] : undefined;
  if (!name) return { title: head, sub: rest.join(" · ") };
  return { title: name, sub: [...rest, head.trim()].join(" · ") };
}

export const DEFAULT_CONFIG: SiteConfig = {
  announcement: { enabled: false, text: "", link: "", tone: "info" },
  keyDates: [
    { id: "teaching-end", label: "End of teaching", date: "2026-12-04" },
    { id: "cats", label: "End-of-semester CATs", date: "2026-12-08" },
  ],
  timetable: {},
  unitNames: {},
  hiddenFiles: [],
  renames: {},
};

const KEY = "site_config";
let current: SiteConfig = DEFAULT_CONFIG;
let loaded = false;
let inflight: Promise<SiteConfig> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function merge(raw: unknown): SiteConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<SiteConfig>;
  return {
    announcement: { ...DEFAULT_CONFIG.announcement, ...(r.announcement ?? {}) },
    keyDates: Array.isArray(r.keyDates) ? r.keyDates.filter((d) => d && d.date) : DEFAULT_CONFIG.keyDates,
    timetable: r.timetable && typeof r.timetable === "object" ? r.timetable : {},
    unitNames: r.unitNames && typeof r.unitNames === "object" ? r.unitNames : {},
    hiddenFiles: Array.isArray(r.hiddenFiles) ? r.hiddenFiles : [],
    renames: r.renames && typeof r.renames === "object" ? r.renames : {},
    proFeatures: r.proFeatures && typeof r.proFeatures === "object" ? r.proFeatures : {},
  };
}

export function loadSiteConfig(force = false): Promise<SiteConfig> {
  if (loaded && !force) return Promise.resolve(current);
  if (inflight && !force) return inflight;
  inflight = getSetting(KEY)
    .then((text) => { current = text ? merge(JSON.parse(text)) : DEFAULT_CONFIG; })
    .catch(() => { current = DEFAULT_CONFIG; })
    .then(() => { loaded = true; inflight = null; emit(); return current; });
  return inflight;
}

/** Admin only (the database rejects anyone else). Throws if the save is refused. */
export async function saveSiteConfig(next: SiteConfig): Promise<void> {
  await saveSetting(KEY, JSON.stringify(next));
  current = next; loaded = true; emit();
}

export async function updateSiteConfig(fn: (c: SiteConfig) => SiteConfig): Promise<void> {
  const base = loaded ? current : await loadSiteConfig();
  await saveSiteConfig(fn(base));
}

export function useSiteConfig(): SiteConfig {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    void loadSiteConfig();
    return () => { listeners.delete(l); };
  }, []);
  return current;
}

/** The timetable for a year: the admin's edited version if there is one, otherwise the official one. */
export function useTimetable(year: number): OfficialScheduleTable[] {
  const cfg = useSiteConfig();
  return cfg.timetable[String(year)] ?? OFFICIAL_2026_SCHEDULES[year] ?? [];
}

export const unitNameMap = (cfg: SiteConfig) => ({ ...DEFAULT_UNIT_NAMES, ...cfg.unitNames });
