// Turns an answer Ompath AI gave into a draft note for the site, so a good answer to a real student question becomes a page that Google can index.
// The draft is saved unpublished: the admin reads it, fixes it, then publishes (so nothing unchecked goes live).
import { parseQuery } from "@/lib/ompathAiQuery";
import { tidyNote } from "@/lib/noteStandard";
import { saveArticle, type Article } from "@/lib/store";
import type { SiteHit } from "@/lib/siteSearch";

const small = new Set(["a", "an", "and", "of", "the", "in", "on", "for", "to", "vs", "with", "or", "at", "by"]);
const titleCase = (s: string) => s.trim().split(/\s+/).map((w, i) => (/^[A-Z0-9]{2,}$/.test(w) || (i > 0 && small.has(w.toLowerCase())) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");

export interface NoteDraft { title: string; category: string; content: string; related: { title: string; href: string }[] }

/** The most likely "Year N: Unit" for a question, from the notes the AI found for it. */
export function guessCategory(hits: SiteHit[], year?: number | null): string {
  const counts = new Map<string, number>();
  for (const h of hits.slice(0, 8)) {
    const m = h.subtitle.match(/^(Year\s*[1-6]\s*:\s*[^·]+?)\s*(?:·|$)/);
    if (m) counts.set(m[1].trim(), (counts.get(m[1].trim()) ?? 0) + 1);
  }
  const top = [...counts.entries()].filter(([c]) => !year || c.startsWith(`Year ${year}`)).sort((a, b) => b[1] - a[1])[0] ?? [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return top?.[0] ?? (year ? `Year ${year}: ` : "");
}

export function answerToDraft(question: string, answer: string, hits: SiteHit[]): NoteDraft {
  const parsed = parseQuery(question);
  const topic = parsed.topic && parsed.topic.length >= 4 ? parsed.topic : question.replace(/[?]+$/, "");
  const title = titleCase(topic).slice(0, 90);
  const related = hits.filter((h) => h.group === "Notes" || h.group === "Units" || h.group === "Outline topics").slice(0, 5).map((h) => ({ title: h.title, href: h.href.split("?")[0] }));
  const body = answer.replace(/^#{1,6}\s*(?:answer|summary)\s*$/gim, "").trim();
  const parts = [`## Key points\n\n${keyPoints(body)}`, body.replace(/^#\s.*$/m, "").trim()];
  if (related.length) parts.push(`## Related notes\n\n${related.map((r) => `- [${r.title}](${r.href})`).join("\n")}`);
  return { title, category: guessCategory(hits, parsed.year), content: tidyNote(parts.join("\n\n"), title), related };
}

/** The first few sentences of the answer as bullet points (a starting point: the admin edits them). */
function keyPoints(body: string): string {
  const flat = body.replace(/^#{1,6}\s.*$/gm, " ").replace(/\|.*\|/g, " ").replace(/^[-*]\s+/gm, "").replace(/[*_`>]/g, "");
  const sentences = flat.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 30 && s.length < 220);
  return (sentences.slice(0, 4).length ? sentences.slice(0, 4) : [flat.slice(0, 160).trim()]).map((s) => `- ${s}`).join("\n");
}

/** Saves the draft (unpublished) and returns it so the caller can open the editor. */
export async function saveAnswerAsDraft(question: string, answer: string, hits: SiteHit[]): Promise<{ article: Article; draft: NoteDraft }> {
  const draft = answerToDraft(question, answer, hits);
  const article = await saveArticle({
    title: draft.title, content: draft.content, original_notes: answer, category: draft.category || "Uncategorized",
    created_at: new Date().toISOString(), published: false, is_raw: false,
  } as Omit<Article, "id">);
  return { article, draft };
}
