# OmpathStudy hosting migration audit

Audit date: 2026-11-06
Source repository: `hydrocephcare/story-weave-box`
Source baseline: `main` at `39f0984c537a51b64d091f412c4c5edda2ada76b`
Isolated working branch: `cloudflare-migration-current`
Target: Cloudflare Workers + Static Assets (staging first)
Runtime database/auth: existing Supabase project `strfwaqvxvkhjbqrwmla` remains unchanged.

## Safety status

- Production DNS is unchanged. Apex and `www` still point to Vercel.
- Vercel has not been disabled or modified.
- Supabase project remains ACTIVE_HEALTHY.
- All 40 Supabase Edge Functions are currently ACTIVE. They are not being migrated or disabled in this hosting phase.
- R2 bucket `ompathstudy` and `cdn.ompathstudy.com` are preserved.
- Existing Cloudflare Workers are preserved.
- Existing Pages project `ompathstudy` is stale (production deployment 2026-08-12; preview deployment 2026-10-23) and is not a valid production candidate.
- No Cloudflare Pages custom domains are attached to the existing Pages project.
- Migration branch is isolated from `main`; no production code is changed by branch-only work.

## Hosting and routing inventory

The application is Vite 5 + React 18. The production build runs content/indexing scripts, `vite build`, library prerendering and private-data stripping.

The Vercel configuration contains:
- 9 header rules
- 12 redirects
- 70 rewrites
- 13 API route files
- 16 shared API modules under `api/_lib`

Every redirect, rewrite, header, crawler-specific metadata route and sitemap route must be preserved or explicitly proven obsolete before cutover.

## API route inventory

| Route | Responsibility | Migration requirement |
| --- | --- | --- |
| `ai-cases.js` | Published clinical-case feed | Preserve Supabase query and cache semantics |
| `ai.js` + `_lib/*` | Consolidated AI operations, chat, drafting, admin and transcription | Preserve auth, task routing, provider secrets and SSE streaming |
| `drive-notes.js` | Google Drive folder listing | Preserve access, pagination and cache behaviour |
| `image-proxy.js` | R2/CDN image proxy | Preserve strict host/path allowlist and binary headers |
| `note-card.js` | Satori/Resvg PNG generation | Replace Node filesystem/native rendering dependency or use compatible rendering service |
| `og-meta.ts` | Dynamic Open Graph metadata | Preserve bot detection, metadata and image selection |
| `og-proxy.js` | Supabase-backed social metadata | Preserve data lookup and crawler output |
| `prerender.ts` | Crawler HTML for dynamic content | Replace Vercel request/response types; preserve canonical, OG and JSON-LD output |
| `sitemap-index.js` | XML sitemap index | Preserve all sitemap references |
| `sitemap.js` | Dynamic sitemap sections | Preserve Supabase integration, XML validity and caching |
| `source-pdf.js` | PDF assembly from source images | Verify jsPDF, binary response and timeouts |
| `student-data.js` | Restricted student library JSON | Preserve student verification; never expose protected JSON as public static assets |
| `topics-sitemap.js` | Topic XML sitemap | Preserve XML output and crawl coverage |

The Vercel Hobby failure is consistent with 13 API route files exceeding the 12-function deployment limit. Moving the application to a single Worker router avoids one-function-per-file deployment semantics, but every route still requires compatibility testing.

## Background workflows and database

The active Supabase project currently reports:
- Project status: ACTIVE_HEALTHY
- 40 active Edge Functions
- 84+ application tables (exact count should be rechecked before final migration report)
- Existing user, content, progress, payment, notification, contest and study data

Hosting migration must leave Supabase, its authentication, database, storage and Edge Functions operational. Do not migrate these in the same phase. Verify frontend-to-Supabase auth, RLS, storage and realtime behaviour from the Cloudflare staging origin.

## SEO preservation checklist

- Preserve all current canonical URLs and route paths.
- Preserve all 70 rewrite rules, including SPA fallback, API aliases, sitemap endpoints and crawler metadata routes.
- Preserve all 12 redirects and their permanent status semantics.
- Preserve all 9 response-header rules, adapting cache headers carefully.
- Preserve sitemap index, section sitemaps, topics sitemap, image sitemap and robots.txt.
- Preserve crawler-specific OG/prerender HTML, JSON-LD, canonical tags and social images.
- Ensure staging is noindex / not submitted to search engines.
- Ensure production is indexable after cutover.
- Compare representative page HTML and metadata before and after migration.

## Security and build blockers

- Root `.env` is tracked on `main` despite ignore rules. It was removed only from this isolated migration branch. Do not copy its contents into build artifacts or logs. Review and rotate any credentials it may contain before enabling CI/CD. Do not rewrite shared Git history without an explicit recovery plan.
- The main branch's latest Vercel emails report the Hobby 12-function limit and separate `npm run build` failures. The latter need actual build logs; they must not be assumed to be caused by the function limit.
- Cloudflare account currently has no confirmed GitHub build connection. A staging deployment pipeline must be established and tested before any domain cutover.
- Worker secrets must be configured as runtime secrets, never as client-exposed Vite variables.
- Node filesystem/native Resvg and protected student-data paths require explicit replacements.

## Migration sequence

1. Reconcile this branch with current `main` (do not deploy this branch while behind).
2. Resolve tracked environment-file risk and rotate any exposed credentials.
3. Add a Worker + Static Assets adapter and an explicit route table.
4. Port API handlers one at a time, preserving headers, status codes, body parsing, streaming and binary responses.
5. Preserve SPA routes, redirects, headers, crawler routes and sitemap behaviour.
6. Configure runtime secrets and bindings while keeping Supabase as-is.
7. Build and test in an isolated staging environment.
8. Run functional regression tests for auth, study resources, progress, publishing, AI, PDF/image, admin and all active background integrations.
9. Run SEO comparisons for URLs, metadata, canonicals, robots, sitemaps, redirects and crawler responses.
10. Only after all tests pass, request approval for DNS cutover. Keep Vercel available for rollback.

## Hard stop conditions

- No apex or `www` DNS edits during implementation.
- No MX, SPF, DKIM, DMARC or email-routing changes.
- No Supabase schema/data/auth/storage migration in this phase.
- No deletion or disabling of existing Workers, Pages projects, Vercel deployments or source data.
- No production cutover until the staging acceptance checklist passes.
