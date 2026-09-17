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

export async function generateMcqs(
  notes: string,
  count: number = 15
): Promise<{ question: string; options: string[]; correct_answer: number; explanation?: string }[]> {
  const { geminiKey, geminiKeys } = await getGeminiKeys();
  const { data, error } = await supabase.functions.invoke('generate-content', {
    body: { notes, type: 'mcqs', count, geminiKey, geminiKeys },
  });
  if (error) throw new Error(error.message || "Failed to generate MCQs");
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function autoCategorizе(notes: string): Promise<string> {
  const { geminiKey, geminiKeys } = await getGeminiKeys();
  const { data, error } = await supabase.functions.invoke('generate-content', {
    body: { notes, type: 'categorize', geminiKey, geminiKeys },
  });
  if (error) return "Uncategorized";
  return data?.category || "Uncategorized";
}
