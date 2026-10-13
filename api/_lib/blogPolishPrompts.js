// What the AI is asked to do for each kind of blog. The goal is the look of the Year 4 notes: a short intro, numbered sections,
// tables and pictures where they help, and practice questions with answers at the end.

export const META_PROMPT = (a, sample) => `You are the editor of a medical study website for MBChB students in Kenya. Judge this page and write its title and search description.
Current title: "${a.title}"
Category: ${a.category}

Start of the page:
"""
${sample}
"""

Answer with ONLY this JSON:
{"verdict":"keep|review|irrelevant","reason":"one short sentence","title":"...","description":"..."}

Rules:
- verdict "irrelevant" only when this is not study material at all (a notice, handbook, timetable, letter, advert, personal details, empty or meaningless text). "review" when it is weak, partly broken or unclear. Otherwise "keep".
- title: clear and specific, under 65 characters, in title case, no quotation marks. Keep a paper's unit, year or semester when it is a past paper (for example "Biochemistry End of Year Exam 2015"). Never invent facts. Drop file codes, repeated "Questions and Answers" and "Awaiting Edit".
- description: 130 to 155 characters, plain sentences saying what a student will learn or practise. No hype, no "Free study material".`;

const COMMON = `Never change the medicine. COPY THE AUTHOR'S SENTENCES NEARLY WORD FOR WORD: you may split a long sentence, join two short ones, move a sentence into the right section, turn a run of items into a list or table, and fix typing mistakes, but you must NOT summarise, shorten, paraphrase or leave anything out. Every fact, number, unit, drug name, abbreviation and every picture line (a line starting with ![ ) must stay exactly.`;

export const NOTE_PROMPT = (a, content) => `You are rewriting a medical study note into the house style of the best notes on the website (the Year 4 notes). ${COMMON}
Title: "${a.title}" (${a.category}).

Write the page in this order:
1. One italic sentence, specific to this note, saying what it covers and what the student will be able to do afterwards (use only what the note says). For example: *The kidney filters blood and balances water, salts and acid; this note follows the nephron from the hilum to the collecting duct.* Never write generic words such as "why it matters to a student".
2. A line starting **In short:** with the whole idea in one or two sentences, or a **The reasoning chain:** line for clinical topics.
3. The body in numbered "## 1. Heading", "## 2. Heading" sections (3 to 9 of them, plain headings). Use "### " only for real sub-sections. Paragraphs of at most three sentences. Bullet lists for lists and sequences. A table only where the note compares things (keep the table's facts).
4. Bold ("**") only the few terms a student must remember, never more than two in a paragraph.
5. Finish with "## Practice questions": 4 to 6 multiple-choice questions made ONLY from facts that are in the note, in exactly this form:

### Question 1
Question text

A. option
B. option
C. option
D. option

Answer: B. the correct option text
Explanation: one sentence from the note.

Other rules:
- Fix typing and grammar mistakes and remove chat leftovers ("Got it, here are the notes"), page markers and stray symbols. Keep the author's words. Do not add new medical facts.
- If the note already ends with practice questions, keep them (in the form above) and do not add more.
- Do not add a title line. Output ONLY the finished markdown, no commentary, no code fences.

NOTE:
"""
${content}
"""`;

/** One piece of a long note: layout and wording only, no intro and no questions (those belong to the whole page). */
export const CHUNK_PROMPT = (a, content, first) => `You are tidying one part of a long medical study note into the house style of the Year 4 notes. ${COMMON}
Title: "${a.title}" (${a.category}).${first ? "\nThis is the FIRST part: begin with one italic sentence saying what the whole note covers (use only what the text says), then a line starting **In short:**." : ""}

Rules:
- Numbered "## 1. Heading" sections where the part has natural sections (keep the part's own heading order and numbering if it has one), "### " for sub-sections, short paragraphs (at most three sentences), bullet lists for lists, a table only where the text compares things.
- Fix typing and grammar, remove chat leftovers, page markers, duplicated lines and stray symbols. Bold only a few key terms (at most two per paragraph). Do not add facts, questions or a title line.
- Output ONLY the finished markdown, no commentary, no code fences.

PART:
"""
${content}
"""`;

/** Every page of questions, whatever mix it has (multiple-choice only, essays only, both, or spot questions with pictures). */
export const QUESTIONS_PROMPT = (a, content) => `You are formatting a page of exam questions for a medical study website, in the house style. Change ONLY the format: never a question, an option, an answer, a mark or a number. ${COMMON}
Title: "${a.title}" (${a.category}).

The page may have multiple-choice questions, written questions (essay, short answer, spot questions with pictures), or both. Lay it out like this.

MULTIPLE-CHOICE questions go first, under the heading "## Multiple-choice questions", each exactly:

### Question 1
Question text

A. option
B. option
C. option
D. option

Answer: B. the correct option text
Explanation: one or two sentences (only if the original had one)

WRITTEN questions go after them, under the heading "## Written questions" (use "## Questions" when the page has no multiple-choice at all), each exactly:

**1. The question text, with its marks if given (a, b, c parts stay on the same line or as a list under it)**
![a picture, if the question has one](the original picture line)
**Model answer:** the original answer or marking scheme, as bullet points, word for word

Rules:
1. Every question, option, answer, explanation, mark and picture of the original must be in your output, word for word, in the original order within each group. Do not shorten anything.
2. Never make an answer up. If a multiple-choice question has no answer, write "Answer: not given". If a written question has no answer, write only its bold question line and nothing after it.
3. Keep other headings, section titles and instructions where they are: a section heading and its instructions stay directly above that section's own questions, and a page holding two papers keeps them apart. Number the questions of each section from 1. Each picture stays directly under the question it belongs to.
4. Remove only stray symbols, page markers and chat leftovers. Output ONLY the finished markdown, no commentary, no code fences.

PAGE:
"""
${content}
"""`;

/** The first attempt dropped content: give back your own version and the exact sentences that are missing from it. */
export const REPAIR_PROMPT = (a, previous, missing, why) => `Your version of this medical page was rejected (${why}) because it left out parts of the original. Below is your version and the sentences of the original that are missing from it. Put every missing sentence back in the right section, word for word, and keep everything else as it is. Never shorten, summarise or paraphrase anything.
Title: "${a.title}" (${a.category}).

MISSING SENTENCES:
${missing.map((m, i) => `${i + 1}. ${m}`).join("\n")}

YOUR VERSION:
"""
${previous}
"""

Output ONLY the full finished markdown, no commentary, no code fences.`;
