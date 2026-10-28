# MCQ answer positions

Where the right answer sits (A, B, C, D, E) must not be guessable. The rules live in one place,
`supabase/functions/_shared/mcqPositions.js`, used by the site, the scripts and the edge functions.

## Rules

- The right answer is never changed. Options are moved (the right option swaps places with another) and the answer pointer follows.
- The answer is the saved `correct_answer_text` when it matches exactly one option (that is what the site grades), otherwise `correct_answer`.
  A saved text that clearly points at a different option, or matches two options, or an option that says "Correct", is flagged for a person and
  never moved.
- Questions whose order means something stay as written: "all/none of the above", "A and B", option text or an explanation that names a letter,
  "the structure labelled B", ordered numbers or grades, sequence questions, true/false.
- A bank is only changed when it has a pattern: every answer one letter, a chi-square test at p < 0.01, one letter over twice its share, no letter
  ever repeated across 16+ questions, answers stepping A, B, C, D, or one letter 6+ times in a row. A fair bank is left exactly as it is.
- Fixes use the fewest moves, are deterministic per bank (seeded by its id), and running them again changes nothing.
- New questions (AI, imports) are dealt from one shuffled, evenly filled deck for the whole batch: no fixed rhythm, no "never the same letter
  twice" (that rule itself gives answers away).

## Where questions come from and what keeps them fair

| Source | Stored in | Fair positions come from |
| --- | --- | --- |
| Note-generated banks (`note-mcqs`), top-ups | `mcq_sets` | `placeNewQuestions` per bank; top-ups fill the letters a bank is short of |
| Weekly exams (`generate-exam`) and the reviewer | `mcq_sets` | `placeNewQuestions`; `balanceBank` after review |
| Question hardener (`mcq-hardener`, `mcqHarden.js`) | `mcq_sets` | `balanceBank` after rewrites; the saved answer text now follows a rewrite |
| Quality fix (`mcq-quality-fix`) | `mcq_sets` | `balanceBank` on write; a lost right option no longer falls back to A |
| Imports (`bulk-cleanup`, `mcq-auto-audit`, `import-wordpress`) | `mcq_sets` | `balanceBank` on every extracted bank |
| Admin writer, AI generator, editor saves | `mcq_sets` | `placeAnswers` / `normalizeMcqQuestions` |
| Contest rounds (`contest-control` import) | `contest_questions` + `private.contest_answer_keys` | `balanceBank` at import (past rounds untouched) |
| Questions inside posts ("Question N / Answer: B") | `articles.content` | Admin > Content health "Balance the answer letters", or the script with `--articles` |
| Topic deep notes | `topic_pages` | `sanitizeDeep` deals them; older pages are evened out when shown |
| Static study notes | `src/content/notes/*.md` | `node scripts/maintenance/balance-note-mcqs.mjs --write` |
| Clinical cases, drills, traps, ladders | code (`src/clinical`, `src/pharm`) | `McqCard` shows each question in a fixed random order (grading uses each option's `ok` flag) |
| Bank and exam pages | display | `shuffleOptions` (seeded per set, so saved sessions line up); timed exams save the chosen option text |

## Checking and fixing stored data

```
npm run mcq:positions -- report                 # counts per letter, per year/subject/source, problem banks; files in reports/
npm run mcq:positions -- plan                   # what a fix would change
npm run mcq:positions -- apply --limit 5        # a sample first (needs SUPABASE_SERVICE_ROLE_KEY for that run)
npm run mcq:positions -- apply --all
npm run mcq:positions -- report --articles      # the same for questions inside posts
npm run mcq:positions -- restore --id <id>      # put one bank (or post, with --articles) back
```

Before `apply`, run migration `20261028140000_mcq_answer_position_backups.sql`: every fix first copies the old version into
`mcq_answer_position_backups` (and a local JSON file), updates the row only if nobody changed it meanwhile, then reads it back and checks it.
Admins can do the same per bank in Admin > Tools > Answer positions. Reports show counts and question numbers only, never which option is right.
