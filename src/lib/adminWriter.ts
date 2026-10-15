import { supabase } from "@/integrations/supabase/client";
import { buildBlogPath, buildFlashcardPath, buildMcqPath, saveArticle, saveFlashcardSet, saveMcqSet, deleteMcqSet } from "@/lib/store";

export interface NoteDraft { type: "note"; title: string; category: string; year: number | null; meta_title: string; meta_description: string; tags: string[]; content: string; raw: string }
export interface McqDraft { type: "mcq"; title: string; category: string; questions: { question: string; options: string[]; correct_answer: number; explanation: string }[]; source: string }
export interface CardsDraft { type: "cards"; title: string; category: string; cards: { question: string; answer: string }[]; source: string }
export type Draft = NoteDraft | McqDraft | CardsDraft;

const SITE = "https://www.ompathstudy.com";

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token; if (!token) throw new Error("Log in as an administrator first.");
  const r = await fetch("/api/ai?task=write", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "The writer could not answer.");
  return j as T;
}

/** The categories already on the site (e.g. "Year 3: General Pathology"), so a new note lands in an existing unit. */
export async function loadCategories(): Promise<string[]> {
  const { data } = await (supabase as any).from("articles").select("category").eq("published", true).is("deleted_at", null).limit(1000);
  const count = new Map<string, number>();
  for (const r of (data || []) as { category: string | null }[]) if (r.category) count.set(r.category, (count.get(r.category) || 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

export async function draftNote(raw: string, hint: { title?: string; category?: string; year?: number | null }, categories: string[]): Promise<NoteDraft> {
  const out = await call<Omit<NoteDraft, "type" | "raw">>({ mode: "note", text: raw, title: hint.title, category: hint.category, categories });
  return { type: "note", ...out, category: hint.category && categories.includes(hint.category) ? hint.category : out.category, year: hint.year ?? out.year, title: (hint.title || out.title || "Study notes").trim(), raw };
}

export async function draftMcqs(text: string, count: number, title: string, category: string): Promise<McqDraft> {
  const out = await call<{ questions: McqDraft["questions"] }>({ mode: "mcq", text, count, title });
  return { type: "mcq", title: title || "MCQ practice", category, questions: out.questions, source: text.slice(0, 200) };
}

export async function draftCards(text: string, count: number, title: string, category: string): Promise<CardsDraft> {
  const out = await call<{ cards: CardsDraft["cards"] }>({ mode: "cards", text, count, title });
  return { type: "cards", title: title || "Flashcards", category, cards: out.cards, source: text.slice(0, 200) };
}

/** A brand-new note from a topic. Saved as a draft by default: medical text written from scratch should be read before students see it. */
export async function draftArticle(topic: string, hint: { category?: string; year?: number | null }, categories: string[]): Promise<NoteDraft> {
  const out = await call<Omit<NoteDraft, "type" | "raw">>({ mode: "article", text: topic, category: hint.category, categories });
  return { type: "note", ...out, category: hint.category && categories.includes(hint.category) ? hint.category : out.category, year: hint.year ?? out.year, title: out.title || topic, raw: "" };
}

/** Changes a polished note the way the admin asks ("shorter", "add a table of the causes"). */
export async function reviseNote(d: NoteDraft, instruction: string): Promise<NoteDraft> {
  const out = await call<{ content: string; meta_description: string }>({ mode: "revise", text: d.content, instruction });
  return { ...d, content: out.content, meta_description: out.meta_description || d.meta_description };
}

/** The share picture people see on WhatsApp for this page (the same card the site serves for sharing). */
export const thumbFor = (title: string, kind: string, year?: number | null, unit?: string) =>
  `/api/note-card?title=${encodeURIComponent(title)}&kind=${encodeURIComponent(kind)}${year ? `&year=${year}` : ""}${unit ? `&unit=${encodeURIComponent(unit)}` : ""}`;

export interface Published { id: string; href: string; url: string; thumb: string; title: string; table: "articles" | "mcq_sets" | "flashcard_sets"; published: boolean }

/** Saves with the same function the editor uses, so slug, tags, search description and share picture are filled in the same way. */
export async function publishDraft(d: Draft, publish: boolean): Promise<Published> {
  if (d.type === "note") {
    const saved = await saveArticle({
      title: d.title, content: d.content, published: publish, original_notes: d.raw, category: d.category || "", is_raw: false,
      meta_title: d.meta_title, meta_description: d.meta_description, tags: d.tags,
    } as any);
    const href = buildBlogPath(saved);
    return { id: saved.id, href, url: SITE + href, thumb: thumbFor(d.title, "Notes", d.year, d.category.replace(/^Year\s*\d+:\s*/i, "")), title: d.title, table: "articles", published: publish };
  }
  if (d.type === "cards") {
    const saved = await saveFlashcardSet({ title: d.title, cards: d.cards, published: publish, original_notes: "", category: d.category || "", is_raw: false } as any);
    const href = buildFlashcardPath(saved);
    return { id: saved.id, href, url: SITE + href, thumb: thumbFor(d.title, "Flashcards"), title: d.title, table: "flashcard_sets", published: publish };
  }
  const saved = await saveMcqSet({
    title: d.title, questions: d.questions as any, published: publish, original_notes: "", category: d.category || "", access_password: "", is_raw: false,
    meta_description: `${d.questions.length} clinical MCQs with answers and explanations: ${d.title}.`,
  } as any);
  const href = buildMcqPath(saved);
  return { id: saved.id, href, url: SITE + href, thumb: thumbFor(d.title, "MCQs"), title: d.title, table: "mcq_sets", published: publish };
}

/** Takes a page off the site (kept in the database, so it can be brought back). */
export async function removeItem(table: "articles" | "mcq_sets" | "flashcard_sets", id: string) {
  if (table === "mcq_sets") return deleteMcqSet(id);
  if (table === "flashcard_sets") { const { error } = await (supabase as any).from("flashcard_sets").update({ deleted_at: new Date().toISOString(), published: false }).eq("id", id); if (error) throw error; return; }
  const { error } = await (supabase as any).from("articles").update({ deleted_at: new Date().toISOString(), published: false }).eq("id", id);
  if (error) throw error;
}

export const seoChecks = (d: NoteDraft) => [
  { ok: d.meta_title.length > 0 && d.meta_title.length <= 60, label: `Title ${d.meta_title.length}/60` },
  { ok: d.meta_description.length >= 110 && d.meta_description.length <= 160, label: `Description ${d.meta_description.length} (aim 120–155)` },
  { ok: d.tags.length >= 3, label: `${d.tags.length} tags` },
  { ok: Boolean(d.category), label: d.category ? d.category : "No category yet" },
];
