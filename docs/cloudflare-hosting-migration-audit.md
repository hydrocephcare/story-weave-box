# OmpathStudy Vercel-to-Cloudflare hosting migration audit

Audit date: 2026-11-06  
Repository: `hydrocephcare/story-weave-box`  
Working branch: `cloudflare-migration`  
Production target: Cloudflare Workers + Workers Static Assets  
Database/auth during this phase: existing production Supabase project remains unchanged.

## Confirmed application shape

- Frontend: Vite 5 + React 18 single-page application.
- Build: `npm run build` runs the site's content-generation and indexing scripts, then `vite build`, library prerendering, and private-data stripping.
- No Cloudflare Worker/Vite plugin configuration exists at the repository root yet.
- The current Cloudflare account has six existing Workers, but none is the full OmpathStudy frontend/API host.
- Cloudflare Workers Builds currently has zero build tokens; the account's repository-connections endpoint returns 404. A GitHub-to-Cloudflare build connection is therefore not ready.
- The repository has `package-lock.json` (npm lockfile v3), plus Bun lockfiles. Preserve the npm lockfile unless the existing deployment workflow proves otherwise.
- `vercel.json` is operational configuration, not disposable metadata. It contains 9 header rules, 12 redirects, and 70 rewrites: API aliases, sitemap routes, crawler-specific metadata routes, and the final SPA fallback. All 70 rewrites must be reviewed and reproduced in the Worker router.

## API inventory and compatibility notes

The current `api/` directory contains these routes:

| Route | Current responsibility | Cloudflare work required |
| --- | --- | --- |
| `ai-cases.js` | Published clinical-case feed from Supabase | Adapt request/response wrapper; preserve cache policy |
| `ai.js` + `_lib/*` | Consolidated AI endpoints (chat, topic, outline, study, polish, drafting, admin tasks, transcription, etc.) | Adapt Vercel request/response contract; bind provider keys as Worker secrets; preserve streaming SSE |
| `drive-notes.js` | Recursive Google Drive folder listing | Adapt request/response; bind folder ID as configuration; preserve crawl limits/cache |
| `image-proxy.js` | Validates and proxies public R2/CDN images | Adapt binary response; retain strict host/path allowlist |
| `note-card.js` | Generates 1200x630 PNG share cards using Satori + Resvg | Node filesystem font read and native Resvg dependency need a Worker-compatible replacement or separate rendering service |
| `og-meta.ts` | Large dynamic Open Graph metadata response | Adapt edge handler contract and route matching; keep metadata generation |
| `og-proxy.js` | Fetches dynamic metadata from Supabase and returns social metadata | Adapt response contract and route matching |
| `prerender.ts` | Dynamic crawler HTML for selected routes | Replace Vercel types/runtime assumptions and preserve crawler detection |
| `sitemap-index.js` | Sitemap index XML | Adapt XML response |
| `sitemap.js` | Dynamic sitemap sections | Adapt XML response and query handling |
| `source-pdf.js` | Builds PDFs from selected R2/CDN source images and Supabase article data | Verify jsPDF runtime compatibility and stream/binary response |
| `student-data.js` | Returns restricted library JSON only after Supabase student verification | Node filesystem read is incompatible; move protected JSON behind a private Worker binding/object store and retain authorization check |
| `topics-sitemap.js` | Dynamic topic sitemap XML | Adapt XML response |

The `api/_lib/` directory contains 16 shared modules. Most are fetch-based AI/Supabase integrations; they depend on environment variables and Vercel-style `req`/`res` semantics. The Worker adapter must not silently drop headers, status codes, JSON bodies, or streamed responses.

## Build and deployment risks

1. **Tracked root `.env`:** GitHub reports `.env` as a tracked file. Its contents were not opened or copied into this audit. Do not connect automated production builds or create a public build artifact until the file is removed from version control and any credentials it contains are rotated. Keep runtime secrets in Cloudflare Worker secrets, not repository files.
2. **Private student files:** `student-data.js` reads protected JSON from the filesystem. The build script deliberately removes `public/data/books.json` from `dist`. This authorization boundary must remain intact; do not put those files in public static assets.
3. **Native image rendering:** `note-card.js` imports Node `fs` and `@resvg/resvg-js`. It cannot be treated as an ordinary Worker route without replacing the font-loading and rendering implementation.
4. **Streaming:** AI chat emits server-sent events. Buffering the complete response would change user-visible behaviour and may increase memory use.
5. **Environment configuration:** `process.env` references across the API layer must become explicit Worker bindings/secrets. Never put AI provider credentials or service-role keys in client-side variables.
6. **SEO:** crawler-specific OG metadata routes, static prerendered library pages, sitemap endpoints, redirects, canonical URLs, and cache headers are required migration scope.

## Migration implementation sequence

- [x] Confirm correct repository and create/use isolated `cloudflare-migration` branch.
- [x] Inspect frontend build scripts, Vite configuration, Vercel routing rules, API route inventory, and Cloudflare's current Vercel migration guidance.
- [ ] Resolve tracked `.env` exposure safely: identify required build-time values without printing secrets, remove the file from Git history/current tracking as appropriate, and rotate exposed credentials.
- [ ] Define Worker environment bindings and secrets; retain Supabase production backend.
- [ ] Add Cloudflare Worker + Static Assets configuration without changing production DNS.
- [ ] Implement and test API compatibility adapter and route table.
- [ ] Port filesystem-dependent protected data and note-card rendering safely.
- [ ] Preserve Vercel redirects, headers, rewrites, sitemap and crawler metadata behaviour.
- [ ] Build and run tests; validate a staging Worker URL, including auth, data, AI streaming, PDF/image responses, SEO, and SPA deep links.
- [ ] Configure GitHub-to-Cloudflare automated builds using least-privilege credentials.
- [ ] Attach and verify custom domains only after staging passes; keep Vercel available for rollback.

## Production safety boundaries

- Do not change apex or `www` DNS during implementation.
- Do not remove or edit MX, SPF, DKIM, DMARC, or other mail records.
- Preserve the existing `cdn.ompathstudy.com` R2 delivery and buckets.
- Do not migrate Supabase data/auth in this hosting phase.
- Do not disable or delete Vercel until the Cloudflare production cutover is verified.
