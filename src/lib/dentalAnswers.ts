import { supabase } from "@/integrations/supabase/client";
import type { PaperItem } from "@/lib/dentalPapers";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

/** The key a question is stored under (the same one the answers job writes): the letters and digits of the question and its parts, hashed. */
export const questionKey = (it: PaperItem) => hash(norm(it.text + (it.parts ?? []).map((p) => p.text).join("")));

/** The model answers written so far for one paper, by question key. Questions that are not answered yet are simply absent. */
export async function loadAnswers(slug: string): Promise<Record<string, string>> {
  try {
    const { data } = await (supabase as any).from("paper_answers").select("qkey, answer").eq("slug", slug).not("answer", "is", null);
    const out: Record<string, string> = {};
    for (const r of (data ?? []) as { qkey: string; answer: string }[]) out[r.qkey] = r.answer;
    return out;
  } catch { return {}; }
}
