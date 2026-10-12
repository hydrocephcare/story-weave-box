// Topic pages: /topic/<slug> gathers everything the site teaches about one subject (a disease, a bone, a process) onto one page.
// The files are built from the notes, MCQs and essays by scripts/topics/build-topics.mjs and served from /topics/.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TopicIndexItem { s: string; n: string; c: string; y: number[]; d: number; q: number; i: number; a: string[]; ai: number }
export interface TopicSource { t: string; u: string; k: "note" | "article"; y: number | null; n: string; m: number }
export interface TopicSet { t: string; u: string; k: "mcq" | "essay"; y: number | null; n: string }
export interface TopicSnippet { t: string; u: string; s: string }
export interface TopicImage { u: string; a: string; p: string; s: string }
export interface TopicQuestion { q: string; o: string[]; a: number; e: string; u: string; s: string }
export interface TopicEssay { q: string; m: string; k: number | null; u: string; s: string }
/** A full write-up of a topic: written by AI from the site's own notes plus standard medical knowledge, saved once, shown to everyone. */
export interface AiPage {
  summary: string;
  aka?: string[];
  sections: { h: string; p?: string; b?: string[]; t?: { a: string; b: string }[] }[];
  exam?: string[];
  whenToSeekHelp?: string[];
  faq?: { q: string; a: string }[];
  related?: string[];
  kind?: string;
  model?: string;
  generatedAt?: string;
  reviewed?: boolean;
}
export interface Topic {
  s: string; n: string; c: string; y: number[]; a: string[]; docs: number;
  lead: TopicSnippet | null; sec?: { h: string; b: string[]; u: string; s: string }[]; src: TopicSource[]; sets: TopicSet[]; snip: TopicSnippet[]; imgs: TopicImage[]; qs: TopicQuestion[]; es: TopicEssay[];
  rel: { s: string; n: string }[];
  rx: { id: string; name: string; first: string[] } | null;
  ai: AiPage | null;
}

export const topicPath = (slug: string) => `/topic/${slug}`;

const RECENT = "ompath_recent_topics";
export interface RecentTopic { s: string; n: string }
/** The last few topics this reader opened, kept on the device only (no account needed). */
export function recentTopics(): RecentTopic[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT) ?? "[]"); return Array.isArray(v) ? v.filter((x) => x?.s && x?.n).slice(0, 8) : []; } catch { return []; }
}
export function rememberTopic(s: string, n: string) {
  try { localStorage.setItem(RECENT, JSON.stringify([{ s, n }, ...recentTopics().filter((x) => x.s !== s)].slice(0, 8))); } catch { /* storage blocked */ }
}

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

// ------------------------------------------------------------------------------------------------------------------------------------
// The full page: what the site has (built at deploy time), what AI has already written and saved, and, when neither is enough, asking
// the server to write it now. The reader never waits on a blank screen: the site's own material is shown at once and the rest slots in.

export type TopicPhase = "loading" | "ready" | "writing" | "unavailable" | "failed" | "rejected" | "missing";
const deslug = (slug: string) => decodeURIComponent(slug).replace(/-/g, " ").replace(/\b([a-z])/g, (m) => m.toUpperCase());
export const slugFromName = (name: string) => name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function loadStoredPage(slug: string): Promise<AiPage | null> {
  try {
    const { data } = await (supabase as unknown as { from: (t: string) => any }).from("topic_pages").select("content,reviewed").eq("slug", slug).eq("status", "published").maybeSingle();
    return data?.content ? { ...(data.content as AiPage), reviewed: Boolean(data.reviewed) } : null;
  } catch { return null; }
}

type Ask = { status: "published"; page: AiPage } | { status: "generating" | "unavailable" | "busy" | "failed" | "rejected" };
async function askServer(name: string, category: string, context: string): Promise<Ask> {
  try {
    // the topic-ai edge function: Gemini writes it once, it is saved, and everyone gets the saved copy after that
    const { data, error } = await supabase.functions.invoke("topic-ai", { body: { name, category, context: context.slice(0, 3000) } });
    let j = (data ?? {}) as { status?: string; page?: AiPage };
    const ctx = (error as { context?: Response } | null)?.context;
    if (error && ctx && typeof ctx.json === "function") j = (await ctx.json().catch(() => ({}))) as typeof j;
    if (j.status === "published" && j.page) return { status: "published", page: j.page };
    if (j.status === "generating" || j.status === "busy" || j.status === "rejected" || j.status === "unavailable") return { status: j.status };
    return { status: "failed" };
  } catch { return { status: "failed" }; }
}

const TRIED = "ompath_topic_tried";
const recentlyTried = (slug: string) => { try { const m = JSON.parse(sessionStorage.getItem(TRIED) ?? "{}") as Record<string, number>; return Date.now() - (m[slug] ?? 0) < 4 * 60_000; } catch { return false; } };
const markTried = (slug: string) => { try { const m = JSON.parse(sessionStorage.getItem(TRIED) ?? "{}") as Record<string, number>; m[slug] = Date.now(); sessionStorage.setItem(TRIED, JSON.stringify(m)); } catch { /* storage blocked */ } };

/** Everything a topic page needs. `fresh` turns true when the full write-up arrives while the reader is already looking at the page. */
export function useTopicPage(slug: string) {
  const [topic, setTopic] = useState<Topic | null>(null);
  const [page, setPage] = useState<AiPage | null>(null);
  const [phase, setPhase] = useState<TopicPhase>("loading");
  const [fresh, setFresh] = useState(false);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [asking, setAsking] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    let on = true;
    setTopic(null); setPage(null); setPhase("loading"); setFresh(false); setRedirectTo(null);
    void (async () => {
      let t = await loadTopic(slug);
      if (!on) return;
      if (!t) {
        const target = await resolveTopicSlug(slug);
        if (!on) return;
        if (target && target !== slug) { setRedirectTo(target); return; }
      }
      setTopic(t);
      const stored = await loadStoredPage(slug);
      if (!on) return;
      const have = stored ?? t?.ai ?? null;
      if (have) { setPage(have); setPhase("ready"); return; }

      // nothing written yet: show what the site has straight away, and write the rest in the background
      setPhase(t ? "ready" : "writing");
      if (attempt === 0 && recentlyTried(slug)) { setPhase(t ? "ready" : "failed"); return; }
      markTried(slug);
      const name = t?.n ?? deslug(slug);
      const category = t?.c ?? "";
      const context = t ? [t.lead?.t, ...(t.sec ?? []).flatMap((s) => [s.h, ...s.b]), ...t.snip.map((s) => s.t)].filter(Boolean).join("\n") : "";
      setAsking(true);
      try {
      for (let i = 0; i < 16 && on; i++) {
        const res = await askServer(name, category, context);
        if (!on) return;
        if (res.status === "published") { setPage(res.page); setPhase("ready"); setFresh(Boolean(t)); return; }
        if (res.status === "generating") { await new Promise((r) => setTimeout(r, 4000)); continue; }
        if (res.status === "rejected") { setPhase(t ? "ready" : "rejected"); return; }
        setPhase(t ? "ready" : res.status === "unavailable" ? "unavailable" : "failed");
        if (t) setFresh(false);
        return;
      }
      setPhase(t ? "ready" : "failed");
      } finally { if (on) setAsking(false); }
    })();
    return () => { on = false; };
  }, [slug, attempt]);

  const retry = useCallback(() => { try { const m = JSON.parse(sessionStorage.getItem(TRIED) ?? "{}") as Record<string, number>; delete m[slug]; sessionStorage.setItem(TRIED, JSON.stringify(m)); } catch { /* ignore */ } setAttempt((a) => a + 1); }, [slug]);
  const writing = asking;
  return { topic, page, phase, fresh, redirectTo, retry, writing, name: topic?.n ?? deslug(slug) };
}
