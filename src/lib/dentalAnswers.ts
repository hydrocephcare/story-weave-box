import { supabase } from "@/integrations/supabase/client";




/** The model answers written so far for one paper, by question key. Questions that are not answered yet are simply absent. */
export async function loadAnswers(slug: string): Promise<Record<string, string>> {
  try {
    const { data } = await (supabase as any).from("paper_answers").select("qkey, answer").eq("slug", slug).not("answer", "is", null);
    const out: Record<string, string> = {};
    for (const r of (data ?? []) as { qkey: string; answer: string }[]) out[r.qkey] = r.answer;
    return out;
  } catch { return {}; }
}

export interface PaperSeo { description: string; keywords: string[]; topics: string[] }
/** The search description, keywords and topics the AI wrote for a paper, when it has got to it. */
export async function loadSeo(slug: string): Promise<PaperSeo | null> {
  try {
    const { data } = await (supabase as any).from("paper_seo").select("description, keywords, topics").eq("slug", slug).maybeSingle();
    return data ?? null;
  } catch { return null; }
}
