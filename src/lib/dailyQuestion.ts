// One practice question a day, taken from the notes themselves. The same question shows for everyone on the same day, and changes at midnight.
import { IMED, isPublished } from "@/data/imed";
import { findStaticNote, loadStaticNoteText } from "@/data/staticNotes";

export interface DailyQ { noteSlug: string; noteTitle: string; stem: string; options: string[]; answer: number; why: string }

/** Reads the "### Question N" blocks of a note: stem, options A-D (or E), "Answer: B. text", "Explanation: ...". */
export function parseQuestions(md: string): Omit<DailyQ, "noteSlug" | "noteTitle">[] {
  const out: Omit<DailyQ, "noteSlug" | "noteTitle">[] = [];
  for (const block of md.replace(/\r\n/g, "\n").split(/\n(?=###\s+Question\s+\d+)/)) {
    if (!/^###\s+Question/i.test(block)) continue;
    const body = block.replace(/^###\s+Question\s+\d+\s*\n/i, "");
    const options = [...body.matchAll(/^([A-E])[.)]\s+(.+)$/gm)].map((m) => m[2].trim());
    const ans = body.match(/^Answer:\s*([A-E])/im)?.[1];
    const stem = body.split(/\n\s*\n/)[0].replace(/\s+/g, " ").trim();
    const why = body.match(/^Explanation:\s*(.+)$/im)?.[1]?.trim() ?? "";
    if (options.length >= 3 && ans && stem.length > 20) out.push({ stem, options, answer: "ABCDE".indexOf(ans), why });
  }
  return out;
}

const dayNumber = () => Math.floor(Date.now() / 86_400_000);

export async function todaysQuestion(): Promise<DailyQ | null> {
  const notes = IMED.flatMap((s) => s.topics).filter(isPublished).map((t) => t.note as string);
  const unique = [...new Set(notes)];
  if (!unique.length) return null;
  const d = dayNumber();
  // try a few notes starting from today's pick, in case one has no readable question
  for (let k = 0; k < 4; k++) {
    const slug = unique[(d * 7 + k * 13) % unique.length];
    const note = findStaticNote(slug);
    if (!note) continue;
    try {
      const qs = parseQuestions(await loadStaticNoteText(slug));
      if (qs.length) { const q = qs[d % qs.length]; return { ...q, noteSlug: slug, noteTitle: note.title }; }
    } catch { /* try the next note */ }
  }
  return null;
}
