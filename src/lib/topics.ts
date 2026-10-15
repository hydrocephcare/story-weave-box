// Topic pages: /topic/<slug> gathers everything the site teaches about one subject (a disease, a bone, a process) onto one page.
// The files are built from the notes, MCQs and essays by scripts/topics/build-topics.mjs and served from /topics/.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { writeTopicPage, aiPaused, looksLikeBot, type TopicChoices } from "@/lib/topicWriter";

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
  subject?: string;
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

/**
 * Every topic page: the ones built with the site, plus the ones written since (read live from the database), so a page that was just
 * published shows up in search, in the A-Z list and as a highlighted word in notes without waiting for the next deploy.
 */
export function loadTopicIndex(): Promise<TopicIndexItem[]> {
  indexPromise ??= (async () => {
    const built = await getJson<TopicIndexItem[]>("/topics/index.json").catch(() => [] as TopicIndexItem[]);
    try {
      const { data } = await (supabase as unknown as { from: (t: string) => any }).from("topic_pages").select("slug,name,category,updated_at").eq("status", "published").order("updated_at", { ascending: false }).limit(1500);
      const have = new Set(built.map((t) => t.s));
      const fresh = ((data ?? []) as { slug: string; name: string; category: string | null }[])
        .filter((r) => r.slug && r.name && !have.has(r.slug))
        .map((r): TopicIndexItem => ({ s: r.slug, n: r.name, c: r.category && DOMAIN_STYLE[r.category] ? r.category : "Medicine", y: [], d: 0, q: 0, i: 0, a: [], ai: 1 }));
      return [...built, ...fresh];
    } catch { return built; }
  })().then((list) => { if (!list.length) indexPromise = null; return list; });
  return indexPromise;
}

/** A page that has just been written is added to the list at once, for this reader, without waiting for the database round trip. */
export function addToTopicIndex(item: { s: string; n: string; c?: string }) {
  void loadTopicIndex().then((list) => { if (!list.some((t) => t.s === item.s)) list.push({ s: item.s, n: item.n, c: item.c && DOMAIN_STYLE[item.c] ? item.c : "Medicine", y: [], d: 0, q: 0, i: 0, a: [], ai: 1 }); });
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

export type TopicPhase = "loading" | "intake" | "ready" | "writing" | "unavailable" | "failed" | "rejected" | "missing";
const deslug = (slug: string) => decodeURIComponent(slug).replace(/-/g, " ").replace(/\b([a-z])/g, (m) => m.toUpperCase());
export const slugFromName = (name: string) => name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export async function loadStoredPage(slug: string): Promise<AiPage | null> {
  try {
    const { data } = await (supabase as unknown as { from: (t: string) => any }).from("topic_pages").select("content,reviewed").eq("slug", slug).eq("status", "published").maybeSingle();
    return data?.content ? { ...(data.content as AiPage), reviewed: Boolean(data.reviewed) } : null;
  } catch { return null; }
}

type Ask = { status: "published"; page: AiPage; redirect?: string } | { status: "generating" | "unavailable" | "busy" | "failed" | "rejected" };
// pages written but not saved (the publish step was not available) are kept on this device for a day, so the reader is not charged twice
const LOCAL = "ompath_topic_local";
const readLocal = (slug: string): AiPage | null => { try { const m = JSON.parse(localStorage.getItem(LOCAL) ?? "{}") as Record<string, { at: number; page: AiPage }>; const v = m[slug]; return v && Date.now() - v.at < 86_400_000 ? v.page : null; } catch { return null; } };
const writeLocal = (slug: string, page: AiPage) => { try { const m = JSON.parse(localStorage.getItem(LOCAL) ?? "{}") as Record<string, { at: number; page: AiPage }>; const keys = Object.keys(m); if (keys.length > 20) delete m[keys[0]]; m[slug] = { at: Date.now(), page }; localStorage.setItem(LOCAL, JSON.stringify(m)); } catch { /* storage full or blocked */ } };

// a name that turned out not to be medical is remembered on this device for a week, so it is not tried again
const REJ = "ompath_topic_rejected";
const wasRejected = (slug: string) => { try { const m = JSON.parse(localStorage.getItem(REJ) ?? "{}") as Record<string, number>; return Date.now() - (m[slug] ?? 0) < 7 * 86_400_000; } catch { return false; } };
const markRejected = (slug: string) => { try { const m = JSON.parse(localStorage.getItem(REJ) ?? "{}") as Record<string, number>; m[slug] = Date.now(); localStorage.setItem(REJ, JSON.stringify(m)); } catch { /* ignore */ } };

async function askServer(slug: string, name: string, category: string, context: string, choices?: TopicChoices): Promise<Ask> {
  if (wasRejected(slug)) return { status: "rejected" };
  const local = readLocal(slug);
  if (local) return { status: "published", page: local };
  const r = await writeTopicPage({ name, category, context, choices });
  if (r.status === "published") {
    const finalSlug = r.slug || slug;
    const finalName = r.name || name;
    if (!r.saved) writeLocal(finalSlug, r.page);
    addToTopicIndex({ s: finalSlug, n: finalName, c: category || (r.page as { subject?: string }).subject });
    if (finalSlug !== slug) { try { const m = JSON.parse(localStorage.getItem("ompath_topic_alias") ?? "{}") as Record<string, string>; m[slug] = finalSlug; localStorage.setItem("ompath_topic_alias", JSON.stringify(m)); } catch { /* ignore */ } return { status: "published", page: r.page, redirect: finalSlug }; }
    return { status: "published", page: r.page }; }
  if (r.status === "rejected") { markRejected(slug); return { status: "rejected" }; }
  if (r.status === "busy" || r.status === "limit") return { status: "busy" };
  return { status: r.status === "bot" || r.status === "paused" ? "unavailable" : "failed" };
}

/**
 * Quietly makes sure a topic has its page: used when Ompath AI has just answered a question about it, so the page is there (and kept for
 * everyone) by the time anyone looks. Does nothing if the page exists, the name is not medical, or the daily limits are used up.
 */
export async function ensureTopicPage(rawName: string): Promise<void> {
  try {
    const name = rawName.trim().replace(/\s+/g, " ");
    if (name.length < 4 || name.length > 60 || name.split(" ").length > 6 || !/^[A-Za-z][A-Za-z0-9 '’()\-,./&]+$/.test(name)) return;
    const slug = slugFromName(name);
    if (slug.length < 4 || (await resolveTopicSlug(slug))) return;
    const index = await loadTopicIndex();
    if (index.some((t) => t.s === slug)) return;
    if (await loadStoredPage(slug)) return;
    await askServer(slug, name, "", "");
  } catch { /* background work must never show an error */ }
}

/** For the quick-read panel: the full write-up for a topic, from storage or written now. Null when it cannot be had. */
export async function pageForPeek(slug: string, name: string, category: string): Promise<AiPage | null> {
  const stored = await loadStoredPage(slug);
  if (stored) return stored;
  const r = await askServer(slug, name, category, "");
  return r.status === "published" ? r.page : null;
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
  const [intake, setIntake] = useState(false);
  const [chosen, setChosen] = useState<{ slug: string; c: TopicChoices } | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    let on = true;
    setTopic(null); setPage(null); setPhase("loading"); setFresh(false); setRedirectTo(null); setIntake(false);
    void (async () => {
      try { const to = (JSON.parse(localStorage.getItem("ompath_topic_alias") ?? "{}") as Record<string, string>)[slug]; if (to && to !== slug) { setRedirectTo(to); return; } } catch { /* ignore */ }
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

      // nothing written yet: ask the reader a few questions first (level, angles, setting, depth), then write the page to match
      const mine = chosen?.slug === slug ? chosen.c : undefined;
      if (!mine && !looksLikeBot() && !aiPaused() && !wasRejected(slug) && !recentlyTried(slug)) { setIntake(true); setPhase(t ? "ready" : "intake"); return; }
      setIntake(false);
      setPhase(t ? "ready" : "writing");
      if (attempt === 0 && recentlyTried(slug)) { setPhase(t ? "ready" : "failed"); return; }
      markTried(slug);
      const name = t?.n ?? deslug(slug);
      const category = t?.c ?? "";
      const context = t ? [t.lead?.t, ...(t.sec ?? []).flatMap((s) => [s.h, ...s.b]), ...t.snip.map((s) => s.t)].filter(Boolean).join("\n") : "";
      setAsking(true);
      try {
      for (let i = 0; i < 16 && on; i++) {
        const res = await askServer(slug, name, category, context, mine);
        if (!on) return;
        if (res.status === "published" && res.redirect) { setRedirectTo(res.redirect); return; }
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
  }, [slug, attempt, chosen]);

  const retry = useCallback(() => { try { const m = JSON.parse(sessionStorage.getItem(TRIED) ?? "{}") as Record<string, number>; delete m[slug]; sessionStorage.setItem(TRIED, JSON.stringify(m)); } catch { /* ignore */ } setAttempt((a) => a + 1); }, [slug]);
  const writing = asking;
  const startWriting = useCallback((c: TopicChoices) => setChosen({ slug, c }), [slug]);
  return { topic, page, phase, fresh, redirectTo, retry, writing, intake, startWriting, name: topic?.n ?? (page as { title?: string } | null)?.title ?? deslug(slug) };
}

/** A page is "deep" when it has the sections, tables and examiner questions a student can revise from. Thin pages stay out of Google until they are rewritten. */
export function isDeepPage(p: { sections?: { b?: unknown[]; t?: unknown[]; p?: string }[]; exam?: unknown[] } | null | undefined): boolean {
  if (!p) return false;
  const secs = p.sections ?? [];
  const points = secs.reduce((n, x) => n + (x.b?.length ?? 0) + (x.t?.length ?? 0) + (x.p ? 1 : 0), 0);
  return secs.length >= 9 && (p.exam?.length ?? 0) >= 8 && points >= 45;
}

/** Admin: write the full, deep version now and replace what is saved. */
export async function rewriteDeeper(slug: string, name: string, category: string): Promise<string> {
  const r = await writeTopicPage({ name, category, context: "", choices: { level: "year4", angles: [], setting: "tropical", depth: "full" } });
  if (r.status !== "published") return "The writer is busy or out of credits. Try again in a minute.";
  const { error } = await (supabase as unknown as { from: (t: string) => { upsert: (v: Record<string, unknown>, o: Record<string, unknown>) => Promise<{ error: { message: string } | null }> } })
    .from("topic_pages").upsert({ slug, name, category: category || (r.page as { subject?: string }).subject || null, status: "published", content: r.page, reviewed: false, updated_at: new Date().toISOString() }, { onConflict: "slug" });
  return error ? error.message : "Rewritten. Reload to read it.";
}
