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
{"verdict":"keep|review|irrelevant","reason":"one short sentence","title":"...","description":"...","image":"..."}

Rules:
- verdict "irrelevant" only when this is not study material at all (a notice, handbook, timetable, letter, advert, personal details, empty or meaningless text). "review" when it is weak, partly broken or unclear. Otherwise "keep".
- title: clear and specific, under 65 characters, in title case, no quotation marks. Keep a paper's unit, year or semester when it is a past paper (for example "Biochemistry End of Year Exam 2015"). Never invent facts. Drop file codes, repeated "Questions and Answers" and "Awaiting Edit".
- description: 130 to 155 characters, plain sentences saying what a student will learn or practise. No hype, no "Free study material".
- image: the exact title of the English Wikipedia article whose lead picture best shows this page's main subject, for example "Kidney" or "Streptococcus pyogenes" or "Atrial septal defect". Use "" (empty) for a past paper, question bank, course outline, notice or any page that is not about one subject.`;

const COMMON = `Never change the medicine. COPY THE AUTHOR'S SENTENCES NEARLY WORD FOR WORD: you may split a long sentence, join two short ones, move a sentence into the right section, turn a run of items into a list or table, and fix typing mistakes, but you must NOT summarise, shorten, paraphrase or leave anything out. Every fact, number, unit, drug name, abbreviation and every picture line (a line starting with ![ ) must stay exactly.`;

const NOTE_COMMON = `Preserve every correct original fact, number, unit, drug name, warning, table, and image line. You may explain and expand the source using standard accepted medical knowledge, but never invent statistics, references, guideline recommendations or drug doses. Do not remove valid source material. If a detail is uncertain, qualify it or leave it out.`;

export const NOTE_PROMPT = (a, content) => `You are the senior medical editor of OmpathStudy. Turn this source into a comprehensive, accurate teaching article for BOTH the general public and MBChB medical students. This is not a short summary. ${NOTE_COMMON}
Title: "${a.title}" (${a.category}).

First classify the subject correctly (disease, anatomy, physiology, pharmacology, pathology, microbiology, biochemistry, public health or another topic) and adapt the headings. Do not force irrelevant disease sections onto a non-disease topic.

Write the page in this order:
1. One clear opening paragraph in plain language for an interested member of the public, followed by the accurate technical definition.
2. **In short:** a concise plain-language explanation, then a precise medical/scientific summary.
3. At least 8 substantive numbered sections (normally 8-14). Use topic-specific headings, not generic filler. Each section needs a genuinely explanatory paragraph and/or 4-8 useful bullets; avoid one-line sections.
4. Include classification and types where they exist. Explain normal physiology and mechanisms before explaining what goes wrong. For clinical topics cover causes/risk factors, pathophysiology, presentation, history and examination, differential diagnoses, investigations with interpretation, management rationale, relevant pharmacology, contraindications, adverse effects, complications, follow-up and prevention. For anatomy cover development, relations, blood/nerve supply, histology, function and applied anatomy. For pharmacology cover classes, prototypes, mechanism, pharmacokinetics, pharmacodynamics, indications, contraindications, adverse effects, interactions and monitoring. For public-health topics include implementation, health systems, equity and evaluation.
5. Include a comparison table where it genuinely clarifies types, differentials, drugs, tests or management choices.
6. Add one or two short, clearly labelled hypothetical examples or clinical cases. Explain the reasoning, not just the answer.
7. Explain technical terms at first use. Use British spelling. Avoid unexplained abbreviations. No invented prevalence figures, sources or doses; when dosing is needed, say it must follow the current local guideline and patient-specific prescription.
8. Finish with **Practice questions**: 8-10 multiple-choice questions, at least half based on short clinical or practical scenarios. Include the answer and a useful explanation grounded in the article. Do not test facts that the article has not taught.

Use numbered "## 1. Heading" sections and "### " only for real subsections. Paragraphs should normally be 2-4 sentences. Use bullets for lists and processes. Bold only key terms, not whole sentences. Keep all original image markdown and URLs unchanged.
Do not add a title line. Output ONLY the finished Markdown, no commentary, no code fences.

SOURCE:
"""
${content}
"""`;

/** Long-note part: retain every original point while adding the explanation needed to make that part teachable. */
export const CHUNK_PROMPT = (a, content, first) => `You are expanding and organising one part of a long medical education article. ${NOTE_COMMON}
Title: "${a.title}" (${a.category}).${first ? "\nThis is the first part: start with a plain-language opening sentence and a short **In short:** explanation." : ""}

Rules:
- Keep the source's heading order and every valid fact. Add concise explanations for mechanisms, terminology, clinical relevance, test interpretation or management rationale only where they belong in this part.
- Do not create a duplicate introduction or conclusion in later parts. Use meaningful numbered headings, 2-4 sentence paragraphs and structured bullets. Explain the "why", not just lists.
- Include the relevant physiology, classification, pharmacology or implementation detail when this part concerns those subjects.
- Preserve all original image markdown and URLs exactly. Do not invent doses, statistics, references or guideline claims.
- Output ONLY the finished Markdown, no commentary, no code fences.

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
4. Remove only stray symbols, page markers and chat leftovers.
5. The page may have been typed from a scan, so its text can be damaged. Delete page markers ("Page 3 of 12 ..."), debris words that belong to nothing, and the pieces of a diagram that were typed as lines of one to four characters ("O", "C——", "HO—C— H", "— OH"); where such a diagram was, write the line *(diagram: see the original pages at the end)*. Correct a word or number only when the sentence itself makes the right one certain (for example "l." at the start of a question is "1."). If a fragment cannot be read, delete it. Never guess and never invent a question, an option or an answer. Each sub-part (a, b, c) and its marks stay with its question.
6. Output ONLY the finished markdown, no commentary, no code fences.

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
