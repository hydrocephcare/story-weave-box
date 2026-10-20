import { supabase } from "@/integrations/supabase/client";
import { getSetting } from "@/lib/store";

async function getGeminiKeys(): Promise<{ geminiKey: string; geminiKeys: string[] }> {
  const [multiRaw, singleKey] = await Promise.all([
    getSetting("gemini_api_keys"),
    getSetting("gemini_api_key"),
  ]);
  let keys: string[] = [];
  if (multiRaw) {
    try { keys = JSON.parse(multiRaw).filter(Boolean); } catch { /* ignore */ }
  }
  if (keys.length === 0 && singleKey) keys = [singleKey];
  return { geminiKey: keys[0] || singleKey || "", geminiKeys: keys };
}

export async function generateArticle(notes: string): Promise<{ title: string; content: string }> {
  const { geminiKey, geminiKeys } = await getGeminiKeys();
  const { data, error } = await supabase.functions.invoke('generate-content', {
    body: { notes, type: 'article', geminiKey, geminiKeys },
  });
  if (error) throw new Error(error.message || "Failed to generate article");
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function generateFlashcards(
  notes: string,
  count: number = 20
): Promise<{ question: string; answer: string }[]> {
  const { geminiKey, geminiKeys } = await getGeminiKeys();
  const { data, error } = await supabase.functions.invoke('generate-content', {
    body: { notes, type: 'flashcards', count, geminiKey, geminiKeys },
  });
  if (error) throw new Error(error.message || "Failed to generate flashcards");
  if (data?.error) throw new Error(data.error);
  return data;
}

/** The right answer must not sit in a predictable place: options are shuffled (unless they refer to each other, like "All of the above"). */
export function shuffleOptions<T extends { options: string[]; correct_answer: number }>(q: T): T {
  const o = q.options || [];
  if (o.length < 3 || o.some((x) => /\b(all|none|both|neither)\b.*\b(above|these|options?)\b|^\s*[a-e]\s*(and|&|,)\s*[a-e]\s*$/i.test(x))) return q;
  const idx = o.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return { ...q, options: idx.map((i) => o[i]), correct_answer: idx.indexOf(q.correct_answer) };
}

export async function generateMcqs(
  notes: string,
  count: number = 30
): Promise<{ question: string; options: string[]; correct_answer: number; explanation?: string }[]> {
  const { geminiKey, geminiKeys } = await getGeminiKeys();
  const { data, error } = await supabase.functions.invoke('generate-content', {
    body: { notes, type: 'mcqs', count, geminiKey, geminiKeys },
  });
  if (error) throw new Error(error.message || "Failed to generate MCQs");
  if (data?.error) throw new Error(data.error);
  return Array.isArray(data) ? data.map(shuffleOptions) : data;
}

export async function autoCategorizе(notes: string): Promise<string> {
  const { geminiKey, geminiKeys } = await getGeminiKeys();
  const { data, error } = await supabase.functions.invoke('generate-content', {
    body: { notes, type: 'categorize', geminiKey, geminiKeys },
  });
  if (error) return "Uncategorized";
  return data?.category || "Uncategorized";
}
