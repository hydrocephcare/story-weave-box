// While a topic is typed, Ompath AI predicts what the student probably wants to test themselves on.
import { askOmpathAi } from "@/lib/topicWriter";

const cache = new Map<string, string[]>();

export async function aiTopicIdeas(query: string, year: number | null, signal?: AbortSignal): Promise<string[]> {
  const q = query.trim();
  const key = String(year) + "|" + q.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const ask = "A " + (year ? "Year " + year + " " : "") + "MBChB student is choosing what to test themselves on and has typed \"" + q + "\". Suggest 6 specific revision topics they most likely mean or would benefit from testing themselves on, the closest match to what they typed first. Reply with ONLY a JSON array of 6 short topic names (at most 4 words each), nothing else.";
  try {
    const text = await askOmpathAi(ask, "", q, "", signal);
    const arr = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)) as unknown[];
    const out = [...new Set(arr.map((x) => String(x).trim()).filter((x) => x.length >= 3 && x.length <= 40))].slice(0, 6);
    if (out.length) cache.set(key, out);
    return out;
  } catch { return []; }
}
