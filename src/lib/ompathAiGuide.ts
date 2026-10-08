// "What is on the site?" questions: what a year covers, and what Ompath Study offers. Read from the site's own catalogue, so it never goes stale
// and never needs the AI.
import { getUnitsForYear } from "@/lib/academic";
import type { PersonalReply } from "@/lib/ompathAiPersonal";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9?' ]/g, " ").replace(/\s+/g, " ").trim();
const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"];

function yearIn(s: string): number | null {
  const m = s.match(/\b(?:year|yr|y)\s*-?\s*([1-6])\b/) || s.match(/\b([1-6])(?:st|nd|rd|th)\s+year\b/) || s.match(/\b(?:which|what)\s+(?:yr|year)\s+(one|two|three|four|five|six)\b/);
  if (m) { const n = Number(m[1]); if (n) return n; const w = ["one", "two", "three", "four", "five", "six"].indexOf(m[1]); if (w >= 0) return w + 1; }
  const w = s.match(/\b(first|second|third|fourth|fifth|sixth)\s+year\b/);
  return w ? ORDINALS.indexOf(w[1]) + 1 : null;
}

const SECTIONS = [
  { label: "Notes by year and unit", href: "/year/1" },
  { label: "Past papers and CATs", href: "/papers" },
  { label: "MCQ sets", href: "/mcqs" },
  { label: "Flashcards", href: "/flashcards" },
  { label: "Library and books", href: "/books" },
  { label: "Stories from students", href: "/stories" },
];

export async function guideReply(input: string, myYear: number | null): Promise<PersonalReply | null> {
  const s = norm(input);
  if (!s || s.length > 160) return null;
  const hasStudy = /\b(notes? on|papers? on|explain|define|what is (a|an|the)? ?[a-z]+ (of|in)|mcqs? on)\b/.test(s);

  // everything the site offers
  if (/\b(what (is|do you have|can i find|s) (on|in) (the |this |your |ompath )?(site|website|platform|ompath)|what does (this|the|ompath) (site|website|platform|study) (have|offer|do)|what is ompath( study)?|what can ompath|what do you offer|everything (on|in) (the )?site)\b/.test(s)) {
    return {
      answer: `**Ompath Study** is a free MBChB study site for Kenyan medical students, organised by year, semester and unit.\n\n${SECTIONS.map((x) => `- ${x.label}`).join("\n")}\n- Timetable and lecturers for MKU students (log in)\n- Revision planner and contests\n\nTell me a year ("what is in year 3?") or a topic ("notes on psychiatry") and I will take you straight there.`,
      followUps: ["What is in year 1?", "What is in year 4?", "Notes on psychiatry"],
      links: [{ label: "Past papers", href: "/papers" }, { label: "Stories", href: "/stories" }],
    };
  }

  // what a year covers
  const asksContent = /\b(content|contents|units?|subjects?|courses?|modules?|syllabus|curriculum|topics|what (is|are) (in|on)|what do we (study|learn|do)|what (do|does) (year|yr)|whats in)\b/.test(s);
  const y = yearIn(s);
  if (asksContent && !hasStudy && (y || /\b(my year|our year|this year)\b/.test(s)) && !/\b(notes? on|papers? on)\b/.test(s)) {
    const year = y ?? myYear;
    if (!year) return { answer: "Which year? Say \"what is in year 3?\" or tell me your year once (\"I am in year 3\").", followUps: ["What is in year 1?", "What is in year 2?", "What is in year 3?", "What is in year 4?"] };
    let units: Awaited<ReturnType<typeof getUnitsForYear>> = [];
    try { units = (await getUnitsForYear(year)).filter((u) => u.published !== false); } catch { /* catalogue unavailable */ }
    const list = units.slice(0, 40).map((u) => `- ${u.name}${u.course_code ? ` (${u.course_code})` : ""}`).join("\n");
    return {
      answer: units.length
        ? `**Year ${year} on Ompath Study: ${units.length} unit${units.length === 1 ? "" : "s"}**\n${list}\n\nOpen the year to see the notes, MCQs, essays, CATs and past papers for each unit.`
        : `Year ${year} is on the site, but its unit list is not published yet. Open it to see what is there.`,
      followUps: [`Year ${year} timetable`, `Year ${year} past papers`, `Notes on ${units[0]?.name ?? "a unit"}`].filter(Boolean),
      links: [{ label: `Open Year ${year}`, href: `/year/${year}` }, { label: "Past papers", href: "/papers" }],
    };
  }
  return null;
}
