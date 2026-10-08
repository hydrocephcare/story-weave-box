// Questions about the student themselves (timetable, lecturers, exam dates, stories, study advice, where things are).
// Everything here is answered from data already on the site, so none of it calls the AI or uses a credit.
import { OFFICIAL_2026_SCHEDULES, MBCHB_2026_TRIMESTER_1, YEAR_TEACHING_STAFF, type OfficialScheduleTable } from "@/lib/timetable2026";
import { formatUnitEntry, type KeyDate } from "@/lib/siteConfig";
import { STORY_CRITERIA, STORY_PROCESS } from "@/lib/storyCriteria";

export interface PersonalCtx {
  /** The year from the student's profile, or the one they told Ompath AI. */
  year: number | null;
  signedIn: boolean;
  /** "verified" for an MKU student with access, null while it is still being checked. */
  status: string | null;
  name?: string;
  group: string;
  tables: Record<number, OfficialScheduleTable[]>;
  unitNames: Record<string, string>;
  keyDates: KeyDate[];
  now: Date;
}
export interface PersonalReply { answer: string; followUps: string[]; clarify?: { question: string; options: string[]; other?: string; send?: Record<string, string> }; links?: { label: string; href: string }[]; setYear?: number; setGroup?: string }

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9?' ]/g, " ").replace(/\s+/g, " ").trim();
const ord = (n: number) => ["", "first", "second", "third", "fourth", "fifth", "sixth"][n] ?? `year ${n}`;
const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"];

function yearFromText(s: string): number | null {
  const m = s.match(/\b(?:year|yr|y)\s*-?\s*([1-6])\b/) || s.match(/\b([1-6])(?:st|nd|rd|th)\s+year\b/);
  if (m) return Number(m[1]);
  const w = s.match(/\b(first|second|third|fourth|fifth|sixth)\s+year\b/);
  return w ? ORDINALS.indexOf(w[1]) + 1 : null;
}

export const YEAR_ASK = { question: "Which year are you in?", options: ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6"], send: Object.fromEntries([1, 2, 3, 4, 5, 6].map((y) => [`Year ${y}`, `I am in year ${y}`])) };
const LOGIN = { label: "Log in", href: "/login?redirect=%2F&mku=1" };

/** Which day the student means: "today", "tomorrow", "friday", "this week". */
function dayFromText(s: string, now: Date): { dates: Date[]; label: string } | null {
  const at = (n: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
  if (/\bday after tomorrow\b/.test(s)) return { dates: [at(2)], label: "the day after tomorrow" };
  if (/\b(tomorrow|tmrw|tommorow|tomorow|tommorrow)\b/.test(s)) return { dates: [at(1)], label: "tomorrow" };
  if (/\b(today|tonight|now)\b/.test(s)) return { dates: [at(0)], label: "today" };
  const short = ["", "mon", "tue|tues", "wed", "thu|thur|thurs", "fri", ""];
  for (let i = 0; i < 7; i++) {
    const abbr = short[i] ? `|${short[i]}` : ""; // "sat" and "sun" are ordinary words, so only the full names count
    if (new RegExp(String.raw`\b(${DAYS[i].toLowerCase()}${abbr})\b`).test(s)) return { dates: [at((i - now.getDay() + 7) % 7)], label: DAYS[i] };
  }
  if (/\b(this week|the week|week|weekly|timetable|time table|schedule)\b/.test(s)) {
    const dates: Date[] = [];
    for (let i = 0; i < 7 && dates.length < 5; i++) { const d = at(i); if (d.getDay() >= 1 && d.getDay() <= 5) dates.push(d); }
    return { dates, label: "the next few days" };
  }
  return null;
}

function sessionsOn(date: Date, tables: OfficialScheduleTable[], group: string, names: Record<string, string>): string[] {
  const day = DAYS[date.getDay()];
  const out: string[] = [];
  for (const t of tables) {
    for (const r of t.rows) {
      if (r.day !== day) continue;
      if (group && r.group && r.group !== group && tables.length === 1) continue;
      const tag = r.group && !group ? ` (group ${r.group})` : "";
      for (const e of r.entries) {
        if (/change ?over|lunch/i.test(e)) continue;
        const { title, sub } = formatUnitEntry(e, names);
        out.push(`${title}${sub ? ` — ${sub}` : ""}${tag}${tables.length > 1 ? ` [${t.label}]` : ""}`);
      }
    }
  }
  return [...new Set(out)];
}

const isTimetableQuestion = (s: string) =>
  !/\b(notes?|papers?|mcqs?|essays?|flashcards?|slides?|pdf|books?|past|drug|drugs|class of)\b/.test(s) &&
  (/\b(timetable|time table|schedule|classes|what do we have|what have we got|what are we having|what is on|whats on|what s on|any lectures?|venue)\b/.test(s) ||
    /\blectures? (today|tomorrow|tommorow|this week|on)\b/.test(s) || /\bwhere (is|are) (the |our )?(class|lecture|session)\b/.test(s) ||
    /\bwhat (do|are|did|will|shall) (we|i|you) (have|having|doing|got)\b/.test(s) || /\b(do|will|shall) (we|i) have (a |any )?(class|classes|lectures?|anything|sessions?)\b/.test(s) ||
    /\b(tomorrow|today|tommorow|tomorow|monday|tuesday|wednesday|thursday|friday)\b.*\b(class|classes|lectures?|sessions?|timetable)\b/.test(s) || /\b(class|classes|lectures?|sessions?)\b.*\b(tomorrow|today|tommorow|tomorow|tonight)\b/.test(s));

const ADVICE: Record<number, string[]> = {
  1: ["Learn anatomy by drawing and labelling, not only reading. Ten minutes of drawing beats an hour of re-reading.", "Do a few past-paper questions every week from the start, so the exam style is never new.", "Biochemistry and physiology reward understanding the pathways. Explain each one out loud as if teaching a friend."],
  2: ["Make short tables for every microbe: organism, how it spreads, what it causes, the test, the treatment.", "Pair each lecture with 10 MCQs the same day. Questions you get wrong tell you what to read next.", "Form a small group of 3 or 4 and quiz each other once a week."],
  3: ["Link every pathology topic to the normal physiology you already know. The disease is the normal process gone wrong.", "Do pharmacology by drug class: mechanism, uses, side effects, interactions. Cards work well here.", "Work through past papers by unit and mark yourself honestly before looking at answers."],
  4: ["Use your ward time. See a patient, then read about that exact condition the same evening.", "Practise taking a history and examining, with a friend, until the order is automatic.", "Mix reading with past papers for each rotation, and keep a short list of the conditions you keep forgetting."],
  5: ["Build a routine: clerk the patient, present the case, read the topic. Repetition is what makes it stick.", "Practise presenting cases aloud in under two minutes.", "Review the common emergencies in your rotation until you can state the first five steps without notes."],
  6: ["Treat every shift as revision: for each patient, say the diagnosis, the investigations and the first-line treatment.", "Rehearse common OSCE stations with a partner.", "Keep one page of drug doses and emergency protocols that you check often."],
};
const GENERAL_ADVICE = ["Study in short focused blocks (25 to 40 minutes) with a real break between them.", "Test yourself instead of re-reading. Questions beat highlighting.", "Revisit a topic after 1 day, 1 week and 1 month. Spacing is what moves it into long-term memory.", "Sleep before an exam. A tired brain recalls less than a rested one."];

const PLACES: [RegExp, string, string][] = [
  [/\b(past papers?|exams? papers?|cats?)\b/, "Past papers and CATs", "/papers"],
  [/\b(latest|new|newest|recent|added)\b.*\b(notes?|files?|uploads?)\b|\b(notes?|files?|uploads?)\b.*\b(latest|new|newest|recent|added)\b/, "Latest notes", "/new-notes"],
  [/\b(flash ?cards?)\b/, "Flashcards", "/flashcards"],
  [/\b(mcqs?|quiz)\b/, "MCQ sets", "/mcqs"],
  [/\b(stories|story)\b/, "Stories", "/stories"],
  [/\b(revision planner|plan)\b/, "Revision planner", "/revision-planner"],
  [/\b(books?|textbooks?)\b/, "Books", "/books"],
  [/\b(contests?|competition)\b/, "Contests", "/contests"],
  [/\b(account|profile|login|log in|sign in)\b/, "Your account", "/account"],
  [/\b(download|install|app)\b/, "Get the app", "/download-app"],
  [/\b(about|who made|owner|creator)\b/, "About Ompath Study", "/about"],
];

export function personalReply(input: string, c: PersonalCtx): PersonalReply | null {
  const s = norm(input);
  if (!s || s.length > 200) return null;
  const words = s.split(" ").length;

  // --- "I am in year 4", "I am group B": remembered on this device
  const iAmYear = s.match(/^(?:i am|i m|im|am|i'm|iam|my year is|i study|i'm in|i am in|im in)\s+(?:a\s+)?(?:in\s+)?(?:year\s*([1-6])|(first|second|third|fourth|fifth|sixth)\s+year|yr\s*([1-6])|([1-6])(?:st|nd|rd|th)\s+year)\b/);
  if (iAmYear && !/\b(stor(y|ies)|publish|submit)\b/.test(s)) {
    const y = Number(iAmYear[1] ?? iAmYear[3] ?? iAmYear[4]) || ORDINALS.indexOf(iAmYear[2]) + 1;
    if (y >= 1 && y <= 6) return { answer: `Got it, you are in Year ${y}. I will use that for your timetable and notes. Ask me "what do we have tomorrow?".`, followUps: ["What do we have tomorrow?", `Year ${y} notes`, "Study tips for my year"], setYear: y };
  }
  const iAmGroup = s.match(/^(?:i am|i m|im|i'm|my group is|group)\s+(?:in\s+)?(?:group\s+)?([a-d1-4])$/);
  if (iAmGroup) return { answer: `Okay, group ${iAmGroup[1].toUpperCase()}. I will show your group's sessions first.`, followUps: ["What do we have tomorrow?", "Show the full week"], setGroup: iAmGroup[1].toUpperCase() };

  // --- publishing a story
  if ((/\b(publish|submit|post|upload|share|write)\b/.test(s) && /\b(stor(y|ies)|experience|article|blog)\b/.test(s)) || /\bstor(y|ies)\b.*\b(criteria|rules|requirements|guidelines|allowed|eligible)\b/.test(s)) {
    const y = yearFromText(s) ?? c.year;
    const who = y ? `Yes. Being in ${ord(y)} year does not stop you.` : "Yes, any student can.";
    return {
      answer: `${who} Stories are open to every year, and anyone can submit.\n\n**What a story needs**\n${STORY_CRITERIA.map((x) => `- **${x.title}.** ${x.detail}`).join("\n")}\n\n${STORY_PROCESS}`,
      followUps: ["Study tips for my year", "Where are the stories?"],
      links: [{ label: "Submit a story", href: "/stories?write=1" }, { label: "Read stories", href: "/stories" }],
    };
  }

  // --- study advice
  if (/\b(advice|tips?|how (do|can|should) i (study|revise|prepare|pass|read|learn)|study plan|revision plan|how to (study|revise|pass)|guide me|motivat\w*|overwhelmed|struggling|stressed|burn ?out)\b/.test(s) && !/\b(notes? on|papers? on)\b/.test(s)) {
    const y = yearFromText(s) ?? c.year;
    const list = [...(y ? ADVICE[y] ?? [] : []), ...GENERAL_ADVICE.slice(0, y ? 2 : 4)];
    return {
      answer: `${y ? `**Year ${y} advice**` : "**Study advice**"}\n${list.map((x) => `- ${x}`).join("\n")}\n\nIf you tell me your year ("I am in year 3") I can tailor this. Feeling overwhelmed is normal in medicine. Talk to a classmate or your lecturer early, not late.`,
      followUps: ["Open the revision planner", "What do we have tomorrow?"],
      links: [{ label: "Revision planner", href: "/revision-planner" }],
    };
  }

  // --- lecturers
  if (/\b(lecturers?|who teaches|who is teaching|who are teaching|teaching staff|teachers?)\b/.test(s)) {
    const y = yearFromText(s) ?? c.year;
    if (!c.signedIn) return { answer: "Log in with your MKU student account first and I will show your year's lecturers.", followUps: [], links: [LOGIN] };
    if (c.status !== null && c.status !== "verified") return { answer: "The lecturers list is for verified MKU students. Open your account to finish verifying.", followUps: [], links: [{ label: "My account", href: "/account" }] };
    if (!y) return { answer: "Which year are you in? I will remember it.", followUps: [], clarify: YEAR_ASK };
    const staff = YEAR_TEACHING_STAFF[y] ?? [];
    return {
      answer: `**Year ${y} lecturers on the official 2026 timetable**\n${staff.map((n) => `- ${n}`).join("\n")}\n\nThe timetable lists the teaching team for the year but does not say who takes each session, so I will not guess a name for a particular class.`,
      followUps: ["What do we have tomorrow?", "When are the CATs?"],
      links: [{ label: `Year ${y} timetable`, href: `/timetable/year-${y}` }],
    };
  }

  // --- exam / CAT dates
  if (/\b(when|date|dates|start|starts|begin)\b/.test(s) && /\b(cats?|exams?|assessments?|teaching ends?|semester ends?|end of (semester|teaching)|trimester)\b/.test(s) && !/\b(notes?|papers?|mcqs?|questions?)\b/.test(s)) {
    const t = MBCHB_2026_TRIMESTER_1;
    const today = `${c.now.getFullYear()}-${String(c.now.getMonth() + 1).padStart(2, "0")}-${String(c.now.getDate()).padStart(2, "0")}`;
    const upcoming = c.keyDates.filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return {
      answer: `**Key dates, Trimester 1 2026**\n- Teaching started: ${fmt(t.startDate)}\n- Teaching ends: ${fmt(t.teachingEndDate)}\n- End-of-semester CATs: ${fmt(t.catStartDate)} to ${fmt(t.catEndDate)}${upcoming.length ? `\n\n**Coming up**\n${upcoming.slice(0, 4).map((d) => `- ${d.label}: ${fmt(d.date)}`).join("\n")}` : ""}`,
      followUps: ["What do we have tomorrow?", "Where are the past papers?"],
      links: [{ label: "Past papers", href: "/papers" }],
    };
  }

  // --- the timetable
  if (isTimetableQuestion(s)) {
    if (!c.signedIn) return { answer: "I need to know who you are first. Log in with your MKU student account and I will show your own timetable.", followUps: [], links: [LOGIN] };
    if (c.status !== null && c.status !== "verified") return { answer: "The timetable is for verified MKU students. Open your account to finish verifying, then ask me again.", followUps: [], links: [{ label: "My account", href: "/account" }] };
    const y = yearFromText(s) ?? c.year;
    if (!y) return { answer: "Which year are you in? Tell me once and I will remember it on this device.", followUps: [], clarify: YEAR_ASK };
    const tables = c.tables[y] ?? OFFICIAL_2026_SCHEDULES[y] ?? [];
    if (!tables.length) return { answer: `There is no timetable published for Year ${y} yet.`, followUps: [] };
    const when = dayFromText(s, c.now) ?? { dates: [new Date(c.now.getFullYear(), c.now.getMonth(), c.now.getDate() + 1)], label: "tomorrow" };
    const start = new Date(`${MBCHB_2026_TRIMESTER_1.startDate}T00:00:00`), end = new Date(`${MBCHB_2026_TRIMESTER_1.teachingEndDate}T23:59:59`);
    const multiGroup = new Set(tables.flatMap((t) => t.rows.map((r) => r.group ?? "").filter(Boolean))).size > 1;
    const blocks: string[] = [];
    for (const d of when.dates) {
      const heading = `${DAYS[d.getDay()]} ${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "short" })}`;
      if (d < start) { blocks.push(`**${heading}.** Teaching has not started yet. The first day is ${start.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}.`); continue; }
      if (d > end) { blocks.push(`**${heading}.** Trimester 1 teaching has ended. CATs run ${MBCHB_2026_TRIMESTER_1.catStartDate} to ${MBCHB_2026_TRIMESTER_1.catEndDate}.`); continue; }
      const rows = sessionsOn(d, tables, c.group, c.unitNames);
      blocks.push(rows.length ? `**${heading}**\n${rows.map((r) => `- ${r}`).join("\n")}` : `**${heading}.** Nothing is listed${d.getDay() === 0 || d.getDay() === 6 ? ", it is the weekend" : ""}.`);
    }
    const hint = multiGroup && !c.group ? "\n\nYour year has groups. Tell me yours (\"I am group B\") and I will show only your sessions." : "";
    const who = c.name ? `${c.name}, here is Year ${y} for ${when.label}.\n\n` : `Year ${y} for ${when.label}.\n\n`;
    return {
      answer: who + blocks.join("\n\n") + hint,
      followUps: when.label === "tomorrow" ? ["What about today?", "Show the full week", "Who are my lecturers?"] : ["What do we have tomorrow?", "Who are my lecturers?"],
      links: [{ label: `Full Year ${y} timetable`, href: `/timetable/year-${y}` }],
    };
  }

  // --- where is X on the site
  if (words <= 8 && /\b(where|how do i|how to|take me|go to|open)\b/.test(s)) {
    const hit = PLACES.find(([re]) => re.test(s));
    if (hit) return { answer: `Here you go: **${hit[1]}**.`, followUps: [], links: [{ label: hit[1], href: hit[2] }] };
  }

  return null;
}
