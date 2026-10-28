import { supabase } from "@/integrations/supabase/client";
import { sanitizeMcqQuestions } from "@/lib/mcq-normalization";
import { isPublicMcqSet } from "@/lib/content-policy";
import { isWeekly } from "@/lib/examMeta";
import { seededRandom, shuffleQuestionOptions } from "../../supabase/functions/_shared/mcqPositions.js";

export interface McqQ { question: string; options: string[]; correct_answer: number; explanation?: string }
export interface McqSetRow { id: string; title: string; slug: string | null; category: string; questions: McqQ[]; exam_year: string | null; source_type: string | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = "id, title, slug, category, questions, exam_year, source_type";

/** Finds a published question set from a link: its id, its stored slug, or the clean public slug (the stored one minus the id suffix). */
export async function resolveMcqSet(param: string): Promise<McqSetRow | null> {
  const key = decodeURIComponent(param).trim();
  const q = () => (supabase as any).from("mcq_sets").select(COLS).eq("published", true).is("deleted_at", null);
  let row: any = null;
  if (UUID.test(key)) row = (await q().eq("id", key).maybeSingle()).data;
  if (!row) row = (await q().eq("slug", key).maybeSingle()).data;
  if (!row) {
    const alt = await q().ilike("slug", `${key.replace(/[%_]/g, "")}-%`).order("created_at", { ascending: false }).limit(5);
    row = (alt.data || []).find((r: any) => /^[0-9a-f]{6,12}$/i.test(String(r.slug).slice(key.length + 1))) ?? null;
  }
  if (!row || !isPublicMcqSet(row)) return null;
  const questions = sanitizeMcqQuestions(row.questions) as McqQ[];
  return questions.length ? { ...row, questions: shuffleOptions(questions, row.id) } : null;
}

/** Timed exams (weekly, unit exams, past papers) are taken on the exam page; everything else is a practice bank. */
export const isExamLike = (row: Pick<McqSetRow, "title" | "category" | "exam_year" | "source_type">): boolean =>
  isWeekly(row.title, row.category) || /exam/i.test(row.title) || row.source_type === "past_paper" || !!row.exam_year;

/** Mixes the order of each question's options (the answer key moves with them), the same way every time for the same set so a saved session still lines up.
 * Questions whose option order means something keep it (see orderSensitive in supabase/functions/_shared/mcqPositions.js). */
export function shuffleOptions<T extends McqQ>(questions: T[], seed: string): T[] {
  return questions.map((q, qi) => shuffleQuestionOptions(q, seededRandom(`${seed}:${qi}`)) as T);
}
