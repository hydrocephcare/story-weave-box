// After a game, or from the record of what keeps going wrong: a short study article written by Ompath AI about exactly what the player did not know.
import { askOmpathAi } from "@/lib/topicWriter";

export interface Missed { q: string; answer: string; explanation?: string }

export async function writeGuide(topic: string, year: number | null, missed: Missed[]): Promise<string> {
  const list = missed.slice(0, 12).map((m, i) => (i + 1) + ". " + m.q.replace(/\s+/g, " ").slice(0, 260) + " Right answer: " + m.answer.slice(0, 160) + (m.explanation ? " (" + m.explanation.slice(0, 160) + ")" : "")).join("\n");
  const ask = "A " + (year ? "Year " + year + " " : "") + "MBChB student just played a game on \"" + topic + "\" and got these wrong or did not know them:\n" + (list || "(no single question: they keep scoring low on this topic)") + "\n\nWrite a short study guide in markdown for exactly these gaps, as an article: a title line starting with #, then 3 to 5 sections starting with ##, each explaining one idea simply and giving the key facts to remember (bullet points, one memory hook or mnemonic where it helps), and a final ## Check yourself section with 3 short questions with answers. Keep it under 450 words. Be accurate; say nothing you are not sure of.";
  const text = await askOmpathAi(ask, "", topic, "");
  return text.trim();
}
