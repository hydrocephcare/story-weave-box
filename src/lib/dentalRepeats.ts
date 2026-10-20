import { PAPER_INDEX, loadPaper, type PaperPart } from "@/lib/dentalPapers";

export interface Repeat { text: string; papers: { slug: string; date: string }[] }

const STOP = new Set(["with", "that", "this", "which", "their", "there", "from", "have", "what", "when", "state", "describe", "explain", "outline", "discuss", "list", "give", "name", "write", "short", "notes", "following", "briefly", "highlight", "mention", "identify", "define", "marks", "each", "about", "into", "using", "used", "also", "other", "between", "your"]);
const toks = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)));
const jaccard = (a: Set<string>, b: Set<string>) => { let i = 0; for (const x of a) if (b.has(x)) i++; return { i, j: i / (a.size + b.size - i || 1) }; };

const leafTexts = (stem: string, parts?: PaperPart[]): string[] => {
  if (!parts?.length) return stem.trim() ? [stem.trim()] : [];
  return parts.flatMap((p) => (p.parts?.length ? p.parts.map((s) => `${p.text} ${s.text}`) : [`${stem ? stem + " " : ""}${p.text}`])).filter((t) => t.trim().length > 12);
};

/** Questions that come up again and again across the papers of one unit: similar wording in two or more different papers. */
export async function repeatedQuestions(unitSlug: string): Promise<Repeat[]> {
  const metas = PAPER_INDEX.filter((p) => p.unitSlug === unitSlug);
  const papers = (await Promise.all(metas.map((m) => loadPaper(m.slug)))).filter((p): p is NonNullable<typeof p> => !!p);
  const clusters: { rep: Set<string>; text: string; papers: Map<string, string> }[] = [];
  for (const p of papers) {
    for (const it of p.pages.flatMap((pg) => pg.items).filter((i) => i.t === "q")) {
      for (const text of leafTexts(it.text, it.parts)) {
        const t = toks(text); if (t.size < 2) continue;
        const hit = clusters.find((c) => { const { i, j } = jaccard(c.rep, t); return i >= 2 && j >= 0.5; });
        if (hit) { hit.papers.set(p.slug, p.dateLabel || p.date); if (text.length < hit.text.length && text.length > 25) hit.text = text; }
        else clusters.push({ rep: t, text, papers: new Map([[p.slug, p.dateLabel || p.date]]) });
      }
    }
  }
  return clusters.filter((c) => c.papers.size >= 2).sort((a, b) => b.papers.size - a.papers.size).slice(0, 15)
    .map((c) => ({ text: c.text.replace(/\s+/g, " ").trim(), papers: [...c.papers.entries()].map(([slug, date]) => ({ slug, date })) }));
}
