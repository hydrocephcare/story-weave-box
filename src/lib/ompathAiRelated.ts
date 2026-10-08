// The notes, files and pages that go with an answer, found with the site search (no AI, no credit). Used under quizzes, drug answers
// and anatomy drills so a student always has something to read next.
import { findHits } from "@/lib/ompathAi";
import type { SiteHit } from "@/lib/siteSearch";

const GROUPS = new Set(["Notes", "Library files", "Units", "Outline topics", "Pages", "MCQs & flashcards"]);

export async function relatedFor(topic: string, year?: number | null): Promise<SiteHit[]> {
  const t = topic.trim();
  if (t.length < 3) return [];
  try {
    const found = await Promise.race([findHits(year ? `${t} year ${year}` : t), new Promise<null>((r) => window.setTimeout(() => r(null), 5000))]);
    if (!found) return [];
    const hits = found.hits.filter((h) => GROUPS.has(h.group));
    // a mix, not six notes: up to 3 notes, 2 files, 2 other pages
    const take = (g: (h: SiteHit) => boolean, n: number) => hits.filter(g).slice(0, n);
    return [...take((h) => h.group === "Notes" || h.group === "MCQs & flashcards", 3), ...take((h) => h.group === "Library files", 2), ...take((h) => h.group === "Units" || h.group === "Outline topics" || h.group === "Pages", 2)];
  } catch { return []; }
}
