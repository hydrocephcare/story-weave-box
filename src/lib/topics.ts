// Topic pages: /topic/<slug> gathers everything the site teaches about one subject (a disease, a bone, a process) onto one page.
// The files are built from the notes, MCQs and essays by scripts/topics/build-topics.mjs and served from /topics/.
import { useEffect, useState } from "react";

export interface TopicIndexItem { s: string; n: string; c: string; y: number[]; d: number; q: number; i: number; a: string[]; ai: number }
export interface TopicSource { t: string; u: string; k: "note" | "article"; y: number | null; n: string; m: number }
export interface TopicSet { t: string; u: string; k: "mcq" | "essay"; y: number | null; n: string }
export interface TopicSnippet { t: string; u: string; s: string }
export interface TopicImage { u: string; a: string; p: string; s: string }
export interface TopicQuestion { q: string; o: string[]; a: number; e: string; u: string; s: string }
export interface TopicEssay { q: string; m: string; k: number | null; u: string; s: string }
export interface Topic {
  s: string; n: string; c: string; y: number[]; a: string[]; docs: number;
  lead: TopicSnippet | null; sec?: { h: string; b: string[]; u: string; s: string }[]; src: TopicSource[]; sets: TopicSet[]; snip: TopicSnippet[]; imgs: TopicImage[]; qs: TopicQuestion[]; es: TopicEssay[];
  rel: { s: string; n: string }[];
  rx: { id: string; name: string; first: string[] } | null;
  ai: { overview: string; key?: string[]; pearls?: string[]; traps?: string[]; on?: string; reviewed: boolean } | null;
}

export const topicPath = (slug: string) => `/topic/${slug}`;

let indexPromise: Promise<TopicIndexItem[]> | null = null;
let aliasPromise: Promise<Record<string, string>> | null = null;

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.json() as Promise<T>;
}

export function loadTopicIndex(): Promise<TopicIndexItem[]> {
  indexPromise ??= getJson<TopicIndexItem[]>("/topics/index.json").catch(() => { indexPromise = null; return []; });
  return indexPromise;
}
export function loadTopicAliases(): Promise<Record<string, string>> {
  aliasPromise ??= getJson<Record<string, string>>("/topics/aliases.json").catch(() => { aliasPromise = null; return {}; });
  return aliasPromise;
}

/** Resolves "odd", "ODD" or "oppositional-defiant-disorder" to the page that exists, or null. */
export async function resolveTopicSlug(input: string): Promise<string | null> {
  const key = decodeURIComponent(input).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!key) return null;
  const aliases = await loadTopicAliases();
  return aliases[key] ?? aliases[key.replace(/-/g, "")] ?? null;
}

export async function loadTopic(slug: string): Promise<Topic | null> {
  try { return await getJson<Topic>(`/topics/${encodeURIComponent(slug)}.json`); } catch { return null; }
}

export function useTopicIndex(): TopicIndexItem[] | null {
  const [items, setItems] = useState<TopicIndexItem[] | null>(null);
  useEffect(() => { let on = true; void loadTopicIndex().then((i) => on && setItems(i)); return () => { on = false; }; }, []);
  return items;
}

/** Clean the caption of an image from a question bank: "Q15 - humerus specimen with A and B labelled" becomes "Humerus specimen with A and B labelled". */
export function imageCaption(alt: string): string {
  const t = alt.replace(/^Q\d+\s*[-–—:.]\s*/i, "").replace(/\s+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Image";
}

export const DOMAIN_STYLE: Record<string, { hue: string; label: string }> = {
  Anatomy: { hue: "from-rose-600 to-orange-500", label: "Anatomy" },
  Physiology: { hue: "from-sky-600 to-cyan-500", label: "Physiology" },
  "Biochemistry & genetics": { hue: "from-violet-600 to-fuchsia-500", label: "Biochemistry & genetics" },
  Pharmacology: { hue: "from-emerald-600 to-teal-500", label: "Pharmacology" },
  "Microbiology & immunology": { hue: "from-lime-600 to-emerald-500", label: "Microbiology & immunology" },
  Pathology: { hue: "from-amber-600 to-red-500", label: "Pathology" },
  Psychiatry: { hue: "from-indigo-600 to-blue-500", label: "Psychiatry" },
  Paediatrics: { hue: "from-pink-600 to-rose-500", label: "Paediatrics" },
  "Obstetrics & gynaecology": { hue: "from-fuchsia-600 to-pink-500", label: "Obstetrics & gynaecology" },
  Surgery: { hue: "from-slate-600 to-zinc-500", label: "Surgery" },
  "Public health": { hue: "from-teal-600 to-green-500", label: "Public health" },
  Medicine: { hue: "from-blue-600 to-indigo-500", label: "Medicine" },
};
