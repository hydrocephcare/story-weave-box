// "What is on the site?" questions: what a year covers, and what Ompath Study offers. Read from the site's own catalogue, so it never goes stale
// and never needs the AI.
import { getUnitsForYear } from "@/lib/academic";
import type { PersonalReply } from "@/lib/ompathAiPersonal";
import { COURSE_OUTLINES } from "@/data/courseOutlines";

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

  // "course outline for psychiatry", "syllabus year 4": straight to the outline and its official text, never the AI
  if (/\b(course ?outlines?|syllabus|curriculum|unit outline|course content)\b/.test(s)) {
    const year = yearIn(s) ?? null;
    const pool = COURSE_OUTLINES.filter((o) => !year || o.year === year);
    const words = (o: { department: string; id: string }) => `${o.department} ${o.id}`.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
    const hits = pool.filter((o) => words(o).some((w) => s.includes(w))).slice(0, 3);
    if (hits.length) {
      return {
        answer: hits.map((o) => `**${o.title}** (Year ${o.year})\n${o.summary}${o.assessment ? `\nAssessment: ${o.assessment}` : ""}`).join("\n\n") + "\n\nEach topic lists its week and lecturer, and the topics that have a study note open it.",
        followUps: [`Notes on ${hits[0].department}`, `Past papers on ${hits[0].department}`, `10 mcqs on ${hits[0].department}`],
        links: hits.flatMap((o) => [{ label: `${o.department}: course outline`, href: `/course-outlines/${o.id}` }, ...(o.info?.length ? [{ label: `${o.department}: official outline text`, href: `/course-outlines/${o.id}#course-outline` }] : [])]).slice(0, 4),
      };
    }
    const y = year ?? myYear;
    return {
      answer: y ? `Course outlines for Year ${y} are on the site: every unit lists its topics by week, with the lecturer, and you can tick topics off as you finish them.` : "Course outlines are on the site for Years 1 to 4 and Year 6. Pick your year.",
      followUps: y ? [] : [1, 2, 3, 4].map((n) => `Course outline year ${n}`),
      links: y ? [{ label: `Year ${y} course outlines`, href: `/course-outlines/year-${y}` }, { label: "All course outlines", href: "/course-outlines" }] : [{ label: "All course outlines", href: "/course-outlines" }],
    };
  }

  // everything the site offers
  if (/\b(what (is|do you have|can i find|s) (on|in) (the |this |your |ompath )?(site|website|platform|ompath)|what does (this|the|ompath) (site|website|platform|study) (have|offer|do)|what is ompath( study)?|what can ompath|what do you offer|everything (on|in) (the )?site)\b/.test(s)) {
    return {
      answer: `**Ompath Study** is a free medical study site for students worldwide, organised by year, semester and unit.\n\n${SECTIONS.map((x) => `- ${x.label}`).join("\n")}\n- Timetable and lecturers for verified students (log in)\n- Revision planner and contests\n\nTell me a year ("what is in year 3?") or a topic ("notes on psychiatry") and I will take you straight there.`,
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
