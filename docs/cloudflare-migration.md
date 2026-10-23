# OmpathStudy: moving off Supabase to Cloudflare

Status as of 2026-10-23. Nothing here changes production DNS. Supabase is kept intact until a migration is verified and approved.

## What runs where today

| Part | Where it runs | Notes |
| --- | --- | --- |
| Website (static build) | Vercel, branch `main` | Live commit matches `git log` on `main`; header `X-Ompath-Source` set in `vercel.json` |
| Serverless routes in `api/` | Vercel | note-card, sitemap, og-proxy, image-proxy, source-pdf, student-data, ai, drive-notes |
| Database, auth, storage, 37 edge functions | Supabase | Currently project `strfwaqvxvkhjbqrwmla` (new, empty of user data); old project `dekyjrfwvavtoivqivno` is locked for exceeding its egress quota; a third older project `lkgfzjwhmfjvntzphbsh` appears in the Google OAuth client and has not been inspected |
| Images uploaded by admins | R2 bucket `ompathstudy`, public at `cdn.ompathstudy.com` | Already on Cloudflare |
| Cloudflare Pages `ompathstudy` | Cloudflare | Last production deployment 12 Aug 2026: stale |

## Edge function inventory (37)

| Function | Needs database | Needs outside AI/service | Move to a Worker |
| --- | --- | --- | --- |
| r2-upload | no (auth check only) | R2 | Done: `ompath-r2-upload` (see below) |
| generate-content | no | AI provider | Candidate: stateless, easiest next |
| topic-ai | no | AI provider | Candidate: stateless |
| paper-answers, paper-similar | yes | Groq | Needs a database decision first |
| content-upgrade | yes | Gemini | Needs database |
| paper-ocr | yes | OmniRoute | Needs database |
| contest-control, send-notification | yes | Resend | Needs database |
| check-payment, initiate-payment, payment-callback | yes | PalPluss | Needs database; payment flow must be tested with real transactions |
| google-drive-import, google-drive-oauth | yes | Google Drive | Needs database |
| google-indexing | yes | Google Indexing API | Needs database |
| note-essays, note-flashcards, note-images, note-mcqs, mcq-*, generate-exam, paper-doctor, seo-batch-update, bulk-cleanup, auto-update-articles, ocr-scans, topic-thumbnail, og-preview, generate-sitemap, import-wordpress, ext-sync, access-code, vimeo-api, r2-migrate | yes | various | Need database |

Functions that touch the database cannot move until the database and authentication target is chosen.

## Storage

- Admin image uploads already go to R2 (`uploads/...`).
- Supabase Storage buckets referenced in code: `study-resources` (PDFs and resources), `story-covers`, `contest-posters`. Their files lived in the old locked project and cannot be listed or copied until access is restored. Nothing was copied.

## Replacement database and authentication: open decisions

| Need | Option | Concern |
| --- | --- | --- |
| Relational data (articles, MCQs, papers, progress) | Cloudflare D1 (SQLite) | 148 migrations are Postgres: row-level security, triggers, jsonb, extensions need rewriting; D1 free limits to be checked |
| Sign-in (Google, email) | A Workers-based auth layer or an external identity service | Must preserve existing accounts, which are in the locked project |
| Scheduled jobs | Workers Cron Triggers | Replaces pg_cron |

No data import should start until the old data is recoverable and the schema is chosen.

## Done and verified

1. Worker `ompath-r2-upload` deployed at `https://ompath-r2-upload.hydrocephcare.workers.dev`. Uses an R2 binding (no stored keys). Requires a signed-in user and only allows the site's own origins. Tested: unauthenticated call refused (401); authenticated upload of a 1x1 PNG succeeded and the file was served from `cdn.ompathstudy.com` with status 200. The site does not use it yet; `src/lib/r2.ts` still calls the Supabase function.
2. Source: `cloudflare/workers/r2-upload`.

## Security note

The Supabase function `r2-upload` currently accepts uploads from anyone with the public key. The Worker above fixes this.

---

## Update 2026-10-23 (phase 2)

### Supabase projects audited

| Project | Access with the credentials in use | Findings |
| --- | --- | --- |
| `strfwaqvxvkhjbqrwmla` (new, "Haboz's Project") | Full, via the management token for that account | 84 public tables, schema applied from the 148 migrations; 3 auth users (test accounts plus the owner); no articles or MCQs; no backups yet (free plan, PITR off) |
| `dekyjrfwvavtoivqivno` (old production, "ompathstudy") | Database readable through the management API of the other Supabase account; the public REST/auth/storage APIs are blocked by the egress restriction | 220 MB database: 1,146 articles, 1,248 MCQ sets, 904 essays, 556 flashcard sets, 158 topic pages, 2,963 paper answers, 34 accounts, 214 files (148 MB, all in bucket `study-resources`). Several backup tables (`articles_content_backup_20261020`, `mcq_sets_backup_oct16`, `seo_backup_oct16`) |
| `lkgfzjwhmfjvntzphbsh` (oldest) | None. It is in neither account's project list | Unknown. It appears only as a redirect address on the Google OAuth client. The owner must say which Supabase account holds it |

### Recovery

The old database is recoverable now: rows can be exported through the management API without touching the restricted public APIs. Storage files (148 MB) are not yet recoverable because the file downloads go through the restricted storage API; they become downloadable once the quota resets or the plan is upgraded.

### Free-tier limits to respect (to be confirmed in the dashboard before creating resources)

- D1: 5 GB total, about 500 MB per database, limited reads and writes per day; the 220 MB database fits, but the daily read limit needs checking against traffic.
- Workers: 100,000 requests per day; Pages: unlimited static requests.
- R2: 10 GB storage free; the 148 MB of files fit.

### Proposed replacement design (not started)

- Database: D1 (SQLite). Postgres-only features need rewriting: row-level security becomes checks in Worker code; `jsonb` becomes JSON text; triggers and cron jobs become Worker code and Cron Triggers.
- Sign-in: Google OAuth handled by a Worker, sessions stored in D1 or KV, httpOnly cookie; existing accounts matched by verified email so students keep their progress.
- Order of work: (1) restore data into the new Supabase project (fastest way to bring the site back), (2) keep Supabase as the runtime while Workers take over the stateless functions, (3) only then move data to D1 and cut over, with Supabase kept until verified.

### Workers

| Worker | Address | Verified | Not verified |
| --- | --- | --- | --- |
| `ompath-r2-upload` | https://ompath-r2-upload.hydrocephcare.workers.dev | Refuses calls with no sign-in (401) and signed-in non-admins (403) | Upload by an admin (needs an admin session) |
| `ompath-generate-content` | https://ompath-generate-content.hydrocephcare.workers.dev | Deployed; bundles the unchanged original function; refuses calls with no sign-in (401) | Admin call to the AI model (needs an admin session) |

`topic-ai` was not ported: it saves pages to the `topic_pages` table, so it needs the database decision first.
