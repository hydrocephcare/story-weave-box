import { supabase } from "@/integrations/supabase/client";

export interface AnswerRecord {
  mcq_set_id: string;
  question_index: number;
  question_text: string;
  selected_answer: number;
  correct_answer: number;
  is_correct: boolean;
}

export async function trackAnswer(record: AnswerRecord) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return; // Only track for logged-in users

  await supabase.from("user_answers").insert({
    user_id: user.id,
    mcq_set_id: record.mcq_set_id,
    question_index: record.question_index,
    question_text: record.question_text,
    selected_answer: record.selected_answer,
    correct_answer: record.correct_answer,
    is_correct: record.is_correct,
  });
}

export async function getWeakQuestions(limit = 60): Promise<{ question_text: string; correct_answer: number; times_wrong: number }[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Get questions the user got wrong, ordered by frequency
  const { data } = await supabase
    .from("user_answers")
    .select("question_text, correct_answer, is_correct")
    .eq("user_id", user.id)
    .eq("is_correct", false)
    .order("created_at", { ascending: false })
    .limit(500);

  if (!data) return [];

  const counts = new Map<string, { question_text: string; correct_answer: number; times_wrong: number }>();
  data.forEach((row: any) => {
    const key = row.question_text;
    const existing = counts.get(key);
    if (existing) {
      existing.times_wrong++;
    } else {
      counts.set(key, { question_text: row.question_text, correct_answer: row.correct_answer, times_wrong: 1 });
    }
  });

  return [...counts.values()]
    .sort((a, b) => b.times_wrong - a.times_wrong)
    .slice(0, limit);
}
