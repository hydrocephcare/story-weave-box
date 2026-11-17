# OmpathStudy Cloudflare migration

## Scope

- Source of truth: `hydrocephcare/story-weave-box`, branch `main`.
- Migration work: `feat/cloudflare-main-migration`.
- Current production host: Vercel project `story-weave-box-j8ry`.
- Production domains remain on Vercel until the Cloudflare stage passes the release checklist.
- Supabase project `strfwaqvxvkhjbqrwmla` remains the database and authentication provider.

## Cloudflare stage

- Pages project: `ompathstudy-cloudflare-stage`.
- Preview URL: `https://ompathstudy-cloudflare-stage.pages.dev`.
- No custom domain is attached.
- Production and preview deployments are limited to this migration branch; preview branch deployments are disabled.

## Migration work

- Port Vercel API handlers to Pages Functions.
- Preserve streaming for Ompath AI chat.
- Port Vercel rewrites, redirects, security headers and cache headers.
- Preserve private MKU library file checks before serving protected data.
- Port dynamic OG metadata and sitemap routes.
- Replace Node-only/native dependencies where the Workers runtime cannot support them.
- Move scheduled tasks only where they are currently Vercel-hosted; GitHub Actions schedules remain independent unless deliberately migrated.

## Release gates

1. Cloudflare build and Pages Functions compilation pass.
2. Anonymous pages, student sign-in, session refresh and sign-out work.
3. MCQs, notes, flashcards, past papers, search, progress and admin workflows pass.
4. AI chat, content-writing endpoints, audio transcription and background content jobs pass.
5. Paystack checkout and webhook verification pass without duplicate charges.
6. Dynamic metadata, redirects, sitemaps, PDF downloads and protected library resources pass.
7. Mobile and desktop smoke tests pass.
8. Supabase data, authentication and storage are unchanged.
9. Rollback to the existing Vercel deployment is verified.

## Safety

Do not move `ompathstudy.com` or `www.ompathstudy.com` until the release gates pass. Do not delete or pause the Vercel project during migration. Never copy secret values into source control.
