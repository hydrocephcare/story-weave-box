import { supabase } from "@/integrations/supabase/client";

/** Downloadable study resource catalogued in Supabase (`public.study_resources`). */
export interface StudyResource {
  id: string;
  year: number;
  unit: string;
  title: string;
  description: string | null;
  category: string;
  file_name: string;
  /** Absolute URL (CDN) or a path inside the `study-resources` storage bucket. */
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  storage_url?: string | null;
  google_drive_file_id?: string | null;
  published?: boolean;
  download_enabled: boolean;
  keywords: string[] | null;
  created_at: string;
  updated_at: string | null;
}

export const RESOURCE_CATEGORIES = [
  "Notes",
  "Past Papers",
  "MCQs",
  "CATs",
  "Clinical Cases",
  "Revision",
  "Practical/Spotters",
  "Lecture Materials",
  "Other Resources",
] as const;
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

export const RESOURCE_BUCKET = "study-resources";

const TABLE = "study_resources";

/** Untyped table access: the catalogue lives outside the generated type file. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from(TABLE);

export async function listYearResources(year: number): Promise<StudyResource[]> {
  const { data, error } = await table()
    .select(
      "id, year, unit, title, description, category, file_name, file_path, file_type, file_size, download_enabled, keywords, created_at, updated_at",
    )
    .eq("year", year)
    .eq("download_enabled", true)
    .order("unit", { ascending: true })
    .order("title", { ascending: true });
  if (error) throw error;
  return (data || []) as StudyResource[];
}

/** Admin view: includes resources that are not yet released to students. */
export async function listAllYearResources(year: number): Promise<StudyResource[]> {
  const { data, error } = await table()
    .select("*")
    .eq("year", year)
    .order("unit", { ascending: true })
    .order("title", { ascending: true });
  if (error) throw error;
  return (data || []) as StudyResource[];
}

export async function saveResource(patch: Partial<StudyResource> & { id?: string }): Promise<void> {
  if (patch.id) {
    const { id, ...rest } = patch;
    const { error } = await table().update(rest).eq("id", id);
    if (error) throw error;
    return;
  }
  const { error } = await table().insert(patch);
  if (error) throw error;
}

export async function deleteResource(id: string): Promise<void> {
  const { error } = await table().delete().eq("id", id);
  if (error) throw error;
}

/** Resolve the real download URL for a catalogue row. */
export function resourceUrl(resource: Pick<StudyResource, "file_path"> & Partial<Pick<StudyResource, "storage_url">>): string {
  const direct = String(resource.storage_url || "").trim();
  if (/^https?:\/\//i.test(direct)) return direct;
  const path = String(resource.file_path || "").trim();
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("drive://")) return `https://drive.google.com/file/d/${encodeURIComponent(path.slice(8))}/view`;
  const clean = path.replace(/^\/+/, "");
  return `https://cdn.ompathstudy.com/${RESOURCE_BUCKET}/${clean}`;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return mb >= 100 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

export function fileTypeLabel(resource: Pick<StudyResource, "file_type" | "file_name">): string {
  const raw = (resource.file_type || resource.file_name.split(".").pop() || "").toLowerCase();
  if (raw.includes("pdf")) return "PDF";
  if (raw.includes("ppt")) return "SLIDES";
  if (raw.includes("doc")) return "DOC";
  if (/(png|jpe?g|webp|gif)/.test(raw)) return "IMAGE";
  return (raw.replace(/[^a-z0-9]/g, "").slice(0, 5) || "FILE").toUpperCase();
}

/**
 * Best-effort classification from the original filename and folder trail.
 * Only evidence in the name decides the category — never a guess by subject.
 */
export function classifyResource(name: string, trail: string[] = []): ResourceCategory {
  const text = `${trail.join(" ")} ${name}`.toLowerCase();
  if (/\bcat\s*-?\s*[123i]?\b|continuous assessment/.test(text)) return "CATs";
  if (/past paper|pastpaper|\bexam\b|examination|\bpaper\s*\d|supplementary|\bmain\b.*\bpaper\b/.test(text)) return "Past Papers";
  if (/\bmcq|multiple choice|question bank|\bquiz\b/.test(text)) return "MCQs";
  if (/spot(ter|ting)?|practical|osce|\bdissection\b|identification/.test(text)) return "Practical/Spotters";
  if (/revision|marathon|high[- ]yield|summary|summaries|mnemonic/.test(text)) return "Revision";
  if (/case\b|clinical case|vignette/.test(text)) return "Clinical Cases";
  if (/slide|lecture|\bppt|presentation/.test(text)) return "Lecture Materials";
  if (/note|handout|\bbook\b|chapter|textbook/.test(text)) return "Notes";
  return "Other Resources";
}

/** Trigger a genuine in-app file download; never navigates the student away. */
export async function downloadResource(resource: StudyResource): Promise<void> {
  const url = resourceUrl(resource);
  const filename = resource.file_name || `${resource.title}`;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  } catch {
    // Storage host without CORS: fall back to a direct download link.
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
