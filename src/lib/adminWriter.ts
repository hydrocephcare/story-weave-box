import { detectUnit } from "@/lib/unitDetect";
import { shuffleOptions } from "@/lib/gemini";
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
  let r: Response;
  try { r = await fetch("/api/ai?task=write", { method: "POST", signal: AbortSignal.timeout(120_000), headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) }); }
  catch { throw new Error("The writer took too long. Please try again."); }
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

/** Pasted text longer than the writer can take in one go is cut at paragraph breaks into pieces of about 9,000 characters, so none of it is lost. */
function chunkText(raw: string, size = 9000): string[] {
  const paras = raw.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const out: string[] = []; let cur = "";
  for (const p of paras) { if (cur && cur.length + p.length > size) { out.push(cur); cur = p; } else cur = cur ? `${cur}\n\n${p}` : p; }
  if (cur) out.push(cur);
  return out;
}

/** Bullets as "- " (the writer sometimes uses "* " or "•"), single blank lines, no stray "# Title" line. */
export function tidyMarkdown(md: string): string {
  return String(md || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => {
      const m = /^(\s*)[*•]\s+(\S.*)$/.exec(l);
      return m && !/^[*•\s]+$/.test(l) ? `${m[1]}- ${m[2]}` : l;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Pieces of one long note, joined: every piece's own "Quick revision" is taken out and ONE is written at the very end from all of their bullets. */
export function joinPieces(pieces: string[]): string {
  const bullets: string[] = [];
  const body = pieces.map((p) => tidyMarkdown(p).replace(/(^|\n)##\s*Quick revision[^\n]*\n([\s\S]*?)(?=\n##\s|$)/gi, (_m, _lead: string, block: string) => { for (const b of block.split("\n")) { const t = b.replace(/^\s*-\s+/, "").trim(); if (t && !bullets.includes(t)) bullets.push(t); } return "\n"; }).trim());
  const quick = bullets.length ? `\n\n## Quick revision\n\n${bullets.slice(0, 12).map((b) => `- ${b}`).join("\n")}` : "";
  return body.join("\n\n").replace(/\n{3,}/g, "\n\n").trim() + quick;
}

export async function draftNote(raw: string, hint: { title?: string; category?: string; year?: number | null; enrich?: boolean }, categories: string[]): Promise<NoteDraft> {
  if (raw.length > 12000) {
    // a long paste: each piece is polished on its own (the first one decides the title and unit), then joined; publishing then splits it into short parts
    const pieces = chunkText(raw);
    const first = await draftNote(pieces[0], hint, categories);
    const rest: string[] = [];
    for (const piece of pieces.slice(1)) {
      const next = await call<Omit<NoteDraft, "type" | "raw">>({ mode: "note", text: piece, title: first.title, category: first.category, categories, enrich: false, continued: true });
      rest.push(next.content.replace(/^#\s+.*\n+/, ""));
    }
    return { ...first, content: joinPieces([first.content, ...rest]), raw };
  }
  const out0 = await call<Omit<NoteDraft, "type" | "raw">>({ mode: "note", text: raw, title: hint.title, category: hint.category, categories, enrich: Boolean(hint.enrich) });
  const out = { ...out0, content: tidyMarkdown(out0.content) };
  const unit = detectUnit(hint.title || out.title || "", raw); // a surgery note is filed under Surgery, never a preclinical unit it only mentions
  const category = hint.category && categories.includes(hint.category) ? hint.category : unit || guessCategory(`${hint.title || ""} ${raw}`, categories) || out.category;
  return { type: "note", ...out, category, year: hint.year ?? out.year, title: (hint.title || out.title || "Study notes").trim(), raw };
}

const UNIT_STOP = new Set(["basic", "clinical", "general", "applied", "introduction", "year", "unit", "medicine", "internal"]);
/**
 * The unit a pasted note belongs to, read from what the text says about itself ("... Pharmacology Notes", "Anatomy of the ..."): the unit whose own words
 * appear most in the opening of the text, the same year first. Returns "" when nothing in the opening names a unit, so the writer's own choice stands.
 */
export function guessCategory(text: string, categories: string[]): string {
  const head = text.slice(0, 600).toLowerCase();
  const year = head.match(/year\s*([1-6])/)?.[1];
  let best = "", bestScore = 0;
  for (const c of categories) {
    const name = c.replace(/^year\s*\d\s*:\s*/i, "").toLowerCase();
    const words = name.split(/[^a-z]+/).filter((w) => w.length > 4 && !UNIT_STOP.has(w));
    let score = words.reduce((n, w) => n + (head.includes(w.replace(/s$/, "")) ? 1 : 0), 0);
    if (!score) continue;
    if (year && new RegExp(`^year\\s*${year}\\b`, "i").test(c)) score += 0.5;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

export async function draftMcqs(text: string, count: number, title: string, category: string): Promise<McqDraft> {
  const out = await call<{ questions: McqDraft["questions"] }>({ mode: "mcq", text, count, title });
  return { type: "mcq", title: title || "MCQ practice", category, questions: out.questions.map(shuffleOptions), source: text.slice(0, 200) };
}

/** The pasted text already holds MCQs: keep them exactly as written, with their answers, and make them ready to publish. */
export async function importMcqs(text: string, title: string, category: string): Promise<McqDraft> {
  const out = await call<{ questions: McqDraft["questions"]; dropped?: number }>({ mode: "mcq_import", text, title });
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

/** Kept for older callers: a note is always saved as ONE page now. Long notes are never cut into "part 1 of N" notes; the page itself loads the whole note. */
export function splitLongNote(content: string): string[] { return [content]; }

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
