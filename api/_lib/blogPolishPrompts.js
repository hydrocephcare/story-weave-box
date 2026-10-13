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

const COMMON = `Never change the medicine. Keep every fact, number, unit, drug name, abbreviation and every picture line (a line starting with ![ ) exactly.`;

export const NOTE_PROMPT = (a, content) => `You are rewriting a medical study note into the house style of the best notes on the website (the Year 4 notes). ${COMMON}
Title: "${a.title}" (${a.category}).

Write the page in this order:
1. One italic sentence saying what the note covers and why it matters to a student (use only what the note says). Example: *This note covers ... and why ...*
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
- Fix typing and grammar mistakes, remove chat leftovers ("Got it, here are the notes"), page markers, duplicated lines and stray symbols, and make unclear sentences clearer. Keep the author's meaning. Do not add new medical facts.
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

export const BANK_PROMPT = (a, content) => `You are formatting a medical multiple-choice question bank for a study website, in the house style of the Year 4 papers. Change ONLY the format, never a question, an option or an answer.
Title: "${a.title}" (${a.category}).

Format every multiple-choice question exactly like this:

### Question 1
Question text

A. option
B. option
C. option
D. option

Answer: B. the correct option text
Explanation: one or two sentences (only if the original had one)

Rules:
1. Keep every question, option, answer and explanation word for word. Do not add questions, answers or explanations that are not there. If the original has no answer for a question, write "Answer: not given" and leave it.
2. Keep section headings, instructions and picture lines (lines starting with ![ ), each picture under the question it belongs to.
3. Remove only stray symbols and page markers.
4. Output ONLY the finished markdown, no commentary, no code fences.

BANK:
"""
${content}
"""`;

export const PAPER_PROMPT = (a, content) => `You are formatting a past paper with written (essay and short-answer) questions for a study website, in the house style of the Year 4 papers. Change ONLY the format.
Title: "${a.title}" (${a.category}).

Rules:
1. Each question becomes "### Question N" (with its marks in brackets if given), then the question text. Sub-parts (a, b, c) stay as a list.
2. If the original has an answer or marking scheme for a question, put it under a line "**Model answer**" as bullet points, word for word. If it has none, write nothing: do not make an answer up.
3. Keep section headings ("## Section A" and so on), instructions, and picture lines (lines starting with ![ ) exactly.
4. Remove only stray symbols and page markers. Output ONLY the finished markdown, no commentary, no code fences.

PAPER:
"""
${content}
"""`;
