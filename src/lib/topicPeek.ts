// The quick-read panel: tap a highlighted word in a note and a short, scrollable summary of that topic slides in, so the reader never
// loses their place. "Open the full page" is there for those who want everything. Anything can open it with topicPeek.open(slug).
import { useEffect, useState } from "react";
import { loadStoredPage, loadTopic, type AiPage } from "@/lib/topics";
import { loadWebMedia } from "@/lib/webMedia";

type Listener = (slug: string | null) => void;
const listeners = new Set<Listener>();
let current: string | null = null;
const emit = () => listeners.forEach((l) => l(current));

export const topicPeek = {
  open(slug: string) { current = slug.replace(/^\/?topic\//, ""); emit(); },
  close() { current = null; emit(); },
  subscribe(l: Listener) { listeners.add(l); l(current); return () => { listeners.delete(l); }; },
};

export function useTopicPeekSlug(): string | null {
  const [slug, setSlug] = useState<string | null>(current);
  useEffect(() => topicPeek.subscribe(setSlug), []);
  return slug;
}

export interface Peek { slug: string; name: string; category: string; summary: string; points: { h: string; t: string }[]; image: { u: string; title: string } | null; names: string[]; written: boolean }

const firstSentence = (p: string) => { const m = p.match(/^.{20,260}?[.!?](\s|$)/); return (m ? m[0] : p).trim().slice(0, 260); };
const deslug = (slug: string) => slug.replace(/-/g, " ").replace(/\b([a-z])/g, (m) => m.toUpperCase());

function pointsOf(page: AiPage | null): { h: string; t: string }[] {
  if (!page) return [];
  const out: { h: string; t: string }[] = [];
  for (const s of page.sections) {
    const lead = s.p ? firstSentence(s.p) : "";
    const t = [lead, ...(s.b ?? []).slice(0, lead ? 1 : 2)].filter(Boolean).join(" ").slice(0, 380);
    if (!t) continue;
    out.push({ h: s.h.replace(/,? most likely first/i, ""), t });
    if (out.length >= 8) break;
  }
  return out;
}

/** What the panel shows at once: the summary and key points from the topic page (no waiting on the web). Never writes anything. */
export async function loadPeek(slug: string): Promise<Peek> {
  const [topic, stored] = await Promise.all([loadTopic(slug), loadStoredPage(slug)]);
  const page = stored ?? topic?.ai ?? null;
  const name = topic?.n ?? deslug(slug);
  let summary = page?.summary ?? topic?.sec?.[0]?.b?.[0] ?? "";
  let points = pointsOf(page);
  if (!points.length && topic?.sec?.length) points = topic.sec.slice(0, 3).map((s) => ({ h: s.h, t: s.b[0] ?? "" })).filter((p) => p.t);
  if (summary.length < 40) summary = "";
  return { slug, name, category: topic?.c ?? "", summary, points, image: null, names: [name, ...(topic?.a ?? []), ...(page?.aka ?? [])].slice(0, 3), written: Boolean(page) };
}

/** The picture (and, for a topic with nothing written yet, the introduction) found online; slower, so it arrives after the panel is already readable. */
export async function enrichPeek(p: Peek): Promise<Peek> {
  const media = await loadWebMedia(p.names).catch(() => null);
  if (!media) return p;
  let { summary, points } = p;
  if (!p.written && media.extract) summary = media.extract;
  if (!points.length && media.sections?.length) points = media.sections.slice(0, 6).map((x) => ({ h: x.h, t: x.p[0].slice(0, 340) }));
  if (summary.length < 40) summary = "";
  return { ...p, summary, points, image: media.hero ? { u: media.hero.u, title: media.hero.title } : p.image };
}
