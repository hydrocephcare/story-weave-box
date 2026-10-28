# What runs by itself (and what to do when it stops)

Nothing here needs an AI assistant to keep working. This page lists every automatic job, where it lives, how to see whether it is running, and the one thing to do if it is not.

## 1. When you add a note (by hand, from Drive or through GPT)

Publish the note. Within hours the site writes, on its own:

| What | Job (Supabase, runs every) | Result |
|---|---|---|
| About 30 MCQs with explanations | `note-mcqs` (3 min) | An MCQ set under MCQs and on the unit page |
| Flashcards | `note-flashcards` (3 min) | A flashcard deck |
| Short and long answer questions | `note-essays` (4 min) | SAQ practice |
| A checker over the new questions | `review-questions` (5 min) | Weak or wrong questions are fixed or hidden |
| A clinical case (Year 4 rotations only) | `note-cases` (3 hours) | A new case in the Clinical simulator, with an illustrated patient and the note's own pictures where they fit |

Each job writes one note per run and skips notes already done, so there is nothing to switch on. The sitemap, the search page, the unit pages and the Search Console feed read from the database, so new items appear without a deploy.

**Check they are running:** Supabase > SQL Editor:

```sql
select j.jobname, d.status, d.start_time
from cron.job_run_details d join cron.job j using (jobid)
where j.jobname in ('note-mcqs','note-flashcards','note-essays','review-questions','note-cases')
order by d.start_time desc limit 10;
```

**See what is still waiting:**

```sql
select count(*) as notes_without_cases from articles a
where published and deleted_at is null and category ~* 'medicine|paediatric|surgery|obstetric|gynaecolog|psychiatr'
  and not exists (select 1 from ai_cases c where c.source_article_id = a.id);
```

**If a job is missing** (it can be lost in a project move): open `supabase/migrations/20261028121000_schedule_note_cases.sql` (cases) and the `20261028110000_restore_ai_jobs.sql` (the question writers), paste into the SQL Editor and press Run. They copy the working `weekly-exams` job, so no key is typed.

**If notes stop getting questions:** the free AI keys are probably used up for the day. Nothing is lost; the jobs retry every few minutes and catch up when the quota returns. Add another free key under Supabase > Edge Functions > Secrets (`GEMINI_API_KEYS` or `GROQ_API_KEYS`, separate several with commas).

## 2. GitHub Actions (github.com > your repository > Actions)

| Workflow | When | What it does | If it fails |
|---|---|---|---|
| Site health check | After every deploy and every morning | Opens real pages on phone and desktop width and fails on script errors, empty pages, sideways scrolling | GitHub e-mails you; the log names the page |
| Sitemap check | Every Monday | Fetches every sitemap address as Googlebot; fails on errors, redirects, noindex or a wrong canonical | The log lists the addresses. Fix the page, or remove it from the sitemap source |
| Tell search engines about new pages | Every day | Sends new and changed pages to IndexNow | Run it again from the Actions tab |
| Daily topic pages and AI overviews | Every day | Writes topic pages and rebuilds the picture sitemap | Run it again; it resumes |
| Supabase keep-alive | Every 6 hours | Keeps the free database awake | Run it again |
| Sort new Drive notes with AI | Every Monday | Files new Drive notes under the right unit | Run it again |

Any workflow can be started by hand: Actions > pick it > Run workflow.

## 3. Google Search Console (search.google.com/search-console)

Property: `https://www.ompathstudy.com/`. Sitemaps submitted: `sitemap.xml`, `image-sitemap.xml`, `library-sitemap.xml`, `dental-sitemap.xml`, `topics-sitemap.xml`, `sitemap-dynamic.xml`. New pages are found through them. Look at Pages > "Why pages aren't indexed" about once a month. Some entries are normal and not errors: pages marked noindex on purpose (search results, exam start pages), old addresses that redirect, and `/contests/.../register` (blocked in robots.txt on purpose).

## 4. The website itself (Vercel)

Every push to `main` deploys automatically. `api/sitemap.js` builds the sitemaps live from the database, so new notes, MCQ sets, flashcards, essays and clinical cases are listed the day they exist.

## 5. Daily study features for students

Daily dose (5 questions), drug of the day, case of the day, the reminder bar and the "This week" replay and test page (`/daily/week`) are built from the same fixed lists, so they work with no daily job. A day can always be replayed exactly as it was.

## 6. Things only you can do

- Pay for or renew the domain, and keep the Supabase and Vercel accounts reachable by an e-mail you can open.
- Add an extra free AI key when the daily quota is not enough (section 1).
- Read the e-mails from GitHub when a check fails; each one says which page is wrong.
- Review a few new AI cases and notes each week for medical accuracy. The AI writes; a clinician should still check.
