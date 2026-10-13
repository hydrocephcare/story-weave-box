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

export interface Peek { slug: string; name: string; category: string; summary: string; points: { h: string; t: string }[]; image: { u: string; title: string } | null }

const firstSentence = (p: string) => { const m = p.match(/^.{20,260}?[.!?](\s|$)/); return (m ? m[0] : p).trim().slice(0, 260); };
const deslug = (slug: string) => slug.replace(/-/g, " ").replace(/\b([a-z])/g, (m) => m.toUpperCase());

function pointsOf(page: AiPage | null): { h: string; t: string }[] {
  if (!page) return [];
  const out: { h: string; t: string }[] = [];
  for (const s of page.sections) {
    const t = s.b?.[0] ?? (s.p ? firstSentence(s.p) : "");
    if (!t || /confus|mislead/i.test(s.h)) continue;
    out.push({ h: s.h.replace(/,? most likely first/i, ""), t });
    if (out.length >= 5) break;
  }
  return out;
}

/** What the panel shows: the summary and a few key points from the topic page, with a picture when one is found. Never writes anything. */
export async function loadPeek(slug: string): Promise<Peek> {
  const topic = await loadTopic(slug);
  const stored = await loadStoredPage(slug);
  const page = stored ?? topic?.ai ?? null;
  const name = topic?.n ?? deslug(slug);
  let summary = page?.summary ?? topic?.sec?.[0]?.b?.[0] ?? "";
  let points = pointsOf(page);
  if (!points.length && topic?.sec?.length) points = topic.sec.slice(0, 3).map((s) => ({ h: s.h, t: s.b[0] ?? "" })).filter((p) => p.t);
  if (!points.length && topic?.snip?.length) points = topic.snip.filter((x) => x.t.length > 40).slice(0, 3).map((x) => ({ h: "From our notes", t: x.t }));
  const media = await loadWebMedia([name, ...(topic?.a ?? []), ...(page?.aka ?? [])].slice(0, 3)).catch(() => null);
  // the page's own summary, or the first clear line from the site's notes; nothing is copied from elsewhere
  if (!summary || summary.length < 40) summary = "";
  return { slug, name, category: topic?.c ?? "", summary, points, image: media?.hero ? { u: media.hero.u, title: media.hero.title } : null };
}
