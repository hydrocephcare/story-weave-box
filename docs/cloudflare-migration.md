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
