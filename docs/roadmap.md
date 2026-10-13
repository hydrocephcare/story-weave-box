# Ompath Study roadmap

Built on what already exists: Groq and Gemini on our own server, a page for every topic, the daily page-writing job, the site health check and the moving subject colours.

## Phase 1 – What readers see first (about a week)
1. **Share cards that look like the page.** Sharing Heart shows the heart picture with the title and "ompathstudy.com" on a strip along the bottom. Notes and blogs get the title, year and unit. One image service for topics, notes, blogs and past papers, with a safe fallback.
2. **Course outline sync (MKU).** Drop a course outline (PDF, Word or pasted text) into an admin box. Ompath AI reads it and saves units, semesters, weeks, topics and lecturers. Every note, blog and topic page is matched to it and shows one line: "Year 4 · Semester 2 · Week 5 · Pancreatitis · Dr X". Unmatched pages go to an admin list for one-tap fixing. Home shows "Taught this week" for the student's year.
3. **Top-of-page summary on every note and blog.** Three lines ("what this page is about"), reading time, and key terms, written once by AI and saved.
4. **Back always returns to the exact spot.** (The Back-to-the-bottom bug is fixed in this push.)

## Phase 2 – Cleaning the 300+ pages in Years 2 and 3
1. **Content health dashboard (admin).** Finds duplicates, near-empty pages, broken formatting, leftover scan/OCR noise, missing pictures, titles that are file names, and unclear categories.
2. **MCQ cleaner.** Checks every question for a missing answer, answers that repeat a letter, options of very different length, "all of the above" traps, stems that contain the answer, and no explanation. Fixes what is safe automatically and queues the rest.
3. **One-click clean for a page.** AI tidies headings, paragraphs and lists; shows before and after; the admin approves. Runs in small daily batches like the topic job, so nothing is spent in a burst.
4. **Review flag.** Each cleaned page is marked "checked", with who and when.

## Phase 3 – Features students keep coming back for
- **Make flashcards from any page** (one tap), and a spaced-repetition review that picks what you are about to forget.
- **Test me on this page**: five questions made from the page, marked with reasons.
- **Weak-topic tracker and daily goal**, a streak, exam countdowns, and a study plan built from the timetable and the outline.
- **Viva and OSCE practice with Ompath AI**: it plays the examiner, one question at a time, and scores you.
- **Highlights and private notes** on any page, bookmarks, collections, and offline reading for saved pages.
- **Read aloud** and a distraction-free reading mode.
- **Study groups and a Year leaderboard** for timed exams (opt-in).

## Phase 4 – Making the site pay for itself
Options, in the order I would try them:
1. **Pro tier** (already half built): offline packs, unlimited AI, flashcard sets, past-paper analytics.
2. **Display ads** (AdSense or similar) on blog pages only, two quiet slots between sections, never in exams or quizzes. Needs enough traffic for approval and careful medical-content settings.
3. **Book and course links** (affiliate) placed in the "Study material" area.
4. **Sponsorship** by a university, society or publisher: a name on the shared card and a "supported by" line.
Ask before turning anything on: ads change how the site feels, so this phase needs your decision.

## Always on
- Site health check after every deploy and every morning (live).
- Daily writing of 25 topic pages (live).
- Speed budget: no page may ship if it loads slower than the last one.
