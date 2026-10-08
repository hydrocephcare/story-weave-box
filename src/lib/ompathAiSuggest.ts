// What to suggest in an empty Ompath AI chat. It follows the student: a first or second year is offered anatomy pictures (gross, histology,
// embryology, the marathons); a student in clinical years is offered notes and papers for the units on this week's timetable, and never anatomy.
import { formatUnitEntry } from "@/lib/siteConfig";
import type { OfficialScheduleTable } from "@/lib/timetable2026";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The units taught in the next 7 days for this year, by their proper names, most frequent first. */
export function unitsThisWeek(tables: OfficialScheduleTable[], names: Record<string, string>, now: Date): string[] {
  const counts = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const day = DAYS[new Date(now.getFullYear(), now.getMonth(), now.getDate() + i).getDay()];
    for (const t of tables) for (const r of t.rows) {
      if (r.day !== day) continue;
      for (const e of r.entries) {
        if (/change ?over|lunch|practical [a-d]$|online/i.test(e)) continue;
        const { title } = formatUnitEntry(e, names);
        if (!/^[A-Z]{2,4}\s?\d{3,4}/.test(title)) counts.set(title, (counts.get(title) ?? 0) + 1); // a raw course code is not a name worth suggesting
      }
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

export interface Suggestions { caption: string; chips: string[] }

export function suggestionsFor(year: number | null, tables: OfficialScheduleTable[], names: Record<string, string>, now: Date, trending: string[]): Suggestions {
  if (!year) {
    return { caption: "Try asking", chips: ["What do we have tomorrow?", "I need notes on psychiatry", "Past papers on pharmacology", "Explain Light's criteria", "I am in year 1", "I am in year 4"] };
  }
  const units = unitsThisWeek(tables, names, now);
  const chips: string[] = [];
  if (year <= 2) {
    chips.push("Gross anatomy questions with pictures", "Histology questions with pictures", "Embryology questions", year === 1 ? "Anatomy marathon" : "Year 2 marathon");
  }
  for (const u of units.slice(0, year <= 2 ? 2 : 3)) chips.push(`Notes on ${u}`, `Past papers on ${u}`);
  chips.push("What do we have tomorrow?");
  if (year > 2) chips.push("Quiz me on " + (units[0] ?? "my unit"));
  for (const t of trending.slice(0, 2)) chips.push(t);
  return {
    caption: year <= 2 ? `Year ${year}: pictures, marathons and this week's units` : `Year ${year}: this week's units from your timetable`,
    chips: [...new Set(chips)].slice(0, 9),
  };
}
