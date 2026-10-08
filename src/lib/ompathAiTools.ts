// Study tools that Ompath AI opens straight from a request, with no AI call and no credit:
//   "30 mcqs on physiology"      -> a quiz built from the site's MCQ sets, answers hidden until you submit
//   "essay questions on shock"   -> essay / short-answer questions with the model answer hidden until you tap
//   "full paper for paediatrics" -> the best matching past paper (or the closest one), fading out after the first lines
import { supabase } from "@/integrations/supabase/client";
import { PAPER_NOTES, loadStaticNoteText, type PaperNote } from "@/data/staticNotes";
import { parseQuery } from "@/lib/ompathAiQuery";

export type ToolSpec =
  | { kind: "quiz"; topic: string; n: number; year: number | null }
  | { kind: "essay"; topic: string; year: number | null }
  | { kind: "paper"; topic: string; year: number | null; latest: boolean };

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9?&' ]/g, " ").replace(/\s+/g, " ").trim();
const TOPIC_AFTER = /\b(?:on|about|in|for|from|covering|of)\s+(.+)$/;
const STOP = /\b(give|show|get|find|need|want|please|pls|me|some|any|a|an|the|my|i|can|you|let|us|generate|make|create|build|do|with|and|full|whole|complete|entire|last|latest|recent|year|yr|years|papers?|past|cats?|exams?|questions?|qns?|mcqs?|multiple|choice|quiz|essays?|saqs?|laqs?|short|long|answers?|structured|test|practice|of|on|about|in|for|from|to|is|are|there|\d+)\b/g;

function topicOf(s: string): string {
  const tail = s.match(TOPIC_AFTER)?.[1];
  const raw = (tail ?? s).replace(STOP, " ").replace(/\s+/g, " ").trim();
  return parseQuery(raw || (tail ?? "")).topic.trim();
}

export function quizIntent(input: string): ToolSpec | null {
  const s = clean(input);
  if (!s || s.length > 140) return null;
  if (/\b(essays?|saqs?|laqs?|short answer|long answer|papers?|notes?|summary|explain|define|what is|flashcards?)\b/.test(s)) return null;
  if (!/\b(mcqs?|multiple choice|quiz|questions?|qns?|test me|practice)\b/.test(s)) return null;
  const n = Number(s.match(/\b(\d{1,3})\s*(?:mcqs?|multiple choice(?: questions?)?|questions?|qns?)\b/)?.[1] ?? 0);
  const topic = topicOf(s);
  if (topic.length < 3) return null;
  return { kind: "quiz", topic, n: Math.min(50, Math.max(5, n || 10)), year: parseQuery(s).year };
}

export function essayIntent(input: string): ToolSpec | null {
  const s = clean(input);
  if (!s || s.length > 140) return null;
  if (!/\b(essays?|saqs?|laqs?|short answers?|long answers?|structured questions?)\b/.test(s)) return null;
  if (/\bpapers?\b/.test(s) || /\b(notes? on|explain|define)\b/.test(s)) return null;
  return { kind: "essay", topic: topicOf(s), year: parseQuery(s).year };
}

export function paperIntent(input: string): ToolSpec | null {
  const s = clean(input);
  if (!s || s.length > 140) return null;
  if (!/\b(papers?|cats?|exams?|end of (semester|year)|main exam|supplementary|past questions)\b/.test(s)) return null;
  if (/\b(mcqs?|quiz|essays?|saqs?|laqs?|notes? on|explain|define|timetable|when|date)\b/.test(s)) return null;
  const q = parseQuery(s);
  return { kind: "paper", topic: topicOf(s), year: q.year, latest: /\b(last year|latest|recent|newest|this year|current|new)\b/.test(s) };
}

// ---------- papers ----------
const satTime = (n: PaperNote) => { const v = n.paper.sat; if (!v) return 0; const t = Date.parse(v.length === 7 ? `${v}-01` : v); return Number.isNaN(t) ? 0 : t; };

export interface PaperPick { best: PaperNote; others: PaperNote[]; exact: boolean }
/** The paper to show: the best match for the topic and year; if nothing matches, the closest one (never "no paper found"). */
export function pickPapers(topic: string, year: number | null, latest: boolean): PaperPick | null {
  if (!PAPER_NOTES.length) return null;
  const words = [...new Set(topic.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3))];
  const scored = PAPER_NOTES.map((n) => {
    const hay = `${n.title} ${n.unit} ${n.group ?? ""} ${n.paper.code} ${n.paper.kind}`.toLowerCase();
    let s = words.filter((w) => hay.includes(w)).length * 10;
    if (year) s += n.year === year ? 6 : -2;
    if (n.paper.complete) s += 2;
    return { n, s, t: satTime(n) };
  });
  scored.sort((a, b) => b.s - a.s || b.t - a.t);
  const topScore = scored[0].s;
  // among equally good matches, "last year" / "latest" means the most recent sitting
  const top = latest ? scored.filter((x) => x.s >= topScore - 1).sort((a, b) => b.t - a.t).concat(scored.filter((x) => x.s < topScore - 1)) : scored;
  const exact = words.length === 0 || topScore - (year ? 6 : 0) >= 10;
  return { best: top[0].n, others: top.slice(1, 4).map((x) => x.n), exact };
}

const strip = (s: string) => s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/<[^>]+>/g, " ").replace(/^#{1,6}\s*/gm, "").replace(/[*_`>|]/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
/** The opening of a paper, as plain text, for the fading preview. */
export async function paperOpening(slug: string, max = 900): Promise<string> {
  try { return strip(await loadStaticNoteText(slug)).slice(0, max); } catch { return ""; }
}

// ---------- essays ----------
export interface EssayQuestion { id: string; setTitle: string; category: string; kind: "Short answer" | "Long answer"; marks: number | null; question: string; answer: string }
const shuffle = <T,>(a: T[]) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

export async function findEssays(topicInput: string, year: number | null): Promise<EssayQuestion[]> {
  const words = [...new Set((parseQuery(topicInput).topic || topicInput).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3))].slice(0, 4);
  let q = supabase.from("essays").select("id,title,category,short_answer_questions,long_answer_questions").eq("published", true).is("deleted_at", null).limit(40);
  if (words.length) q = q.or(words.flatMap((w) => [`title.ilike.%${w}%`, `category.ilike.%${w}%`]).join(","));
  if (year) q = q.ilike("category", `%Year ${year}%`);
  let { data } = await q;
  if (!data?.length && year) {   // the year filter was too strict: drop it
    let again = supabase.from("essays").select("id,title,category,short_answer_questions,long_answer_questions").eq("published", true).is("deleted_at", null).limit(40);
    if (words.length) again = again.or(words.flatMap((w) => [`title.ilike.%${w}%`, `category.ilike.%${w}%`]).join(","));
    data = (await again).data;
  }
  const out: EssayQuestion[] = [];
  for (const r of data ?? []) {
    const add = (list: unknown, kind: EssayQuestion["kind"]) => {
      (Array.isArray(list) ? list : []).forEach((x: { question?: unknown; answer?: unknown; marks?: unknown }, i: number) => {
        if (typeof x?.question === "string" && x.question.trim().length > 12 && typeof x.answer === "string" && x.answer.trim().length > 20) {
          out.push({ id: `${r.id}-${kind[0]}${i}`, setTitle: r.title, category: r.category, kind, marks: Number(x.marks) || null, question: x.question.trim(), answer: x.answer.trim() });
        }
      });
    };
    add(r.short_answer_questions, "Short answer");
    add(r.long_answer_questions, "Long answer");
  }
  return shuffle(out);
}
