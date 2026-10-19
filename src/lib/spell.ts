// "Did you mean": topics on the site that match what was typed even when it is misspelt, then (from the AI) the medical terms it most likely meant.
import { topicPath, type TopicIndexItem } from "@/lib/topics";

export interface Suggestion { name: string; path: string; sub?: string }

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]; prev[0] = i;
    for (let j = 1; j <= b.length; j++) { const up = prev[j]; prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1)); diag = up; }
  }
  return prev[b.length];
}
const limitFor = (len: number) => (len >= 10 ? 3 : len >= 7 ? 2 : len >= 4 ? 1 : 0);
const slugOf = (n: string) => n.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** The site's own topics closest to what was typed (every typed word may be misspelt; a duplicated stray word such as "eous" is ignored). */
export function localSuggestions(items: TopicIndexItem[], query: string, max = 5): Suggestion[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  if (!words.length) return [];
  const scored = items.map((t) => {
    const names = [t.n, ...t.a].map((x) => x.toLowerCase());
    const pieces = [...new Set(names.flatMap((n) => n.split(/[^a-z0-9]+/).filter((w) => w.length >= 3)))];
    let score = 0, hit = 0;
    for (const w of words) {
      let best = 0;
      for (const p of pieces) { const d = distance(w, p); if (d <= limitFor(Math.max(w.length, p.length))) best = Math.max(best, 3 - d / 2 + Math.min(w.length, p.length) / 20); }
      if (best) { hit++; score += best; }
    }
    return { t, score, hit };
  }).filter((x) => x.hit > 0 && x.hit >= Math.ceil(words.length / 3));
  scored.sort((a, b) => b.hit - a.hit || b.score - a.score || b.t.d - a.t.d);
  return scored.slice(0, max).map((x) => ({ name: x.t.n, path: topicPath(x.t.s), sub: x.t.c }));
}

/** The AI's reading of a misspelt medical term, as topic pages (the page is written when someone opens it). */
export async function aiSuggestions(query: string, signal?: AbortSignal): Promise<Suggestion[]> {
  try {
    const r = await fetch("/api/page-study", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "spell", query }), signal });
    if (!r.ok) return [];
    const j = (await r.json()) as { suggestions?: string[] };
    return (j.suggestions ?? []).filter((n) => slugOf(n)).map((n) => ({ name: n, path: topicPath(slugOf(n)) }));
  } catch { return []; }
}
