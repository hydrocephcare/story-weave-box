# OmpathStudy AI topic persistence gateway

## Intended request path

1. The browser calls the existing `/api/topic-write` route with a Neon Auth session.
2. The route forwards the request to the deployed Supabase `ompath-ai` function.
3. The Edge Function validates the Neon JWT and consumes the applicable feature entitlement.
4. Groq drafts the topic or deep notes.
5. Gemini independently reviews medical content. Failed or unavailable review blocks publication.
6. The Edge Function calls the existing Vercel `/api/neon-functions?name=topic-write` dispatcher with the user's JWT and a server-only shared secret.
7. The dispatcher verifies the secret and Neon JWT, then uses the server-side `DATABASE_URL` to call the restricted Neon persistence functions.

The browser never receives `DATABASE_URL` or the shared secret. The Neon RPC functions remain unavailable to ordinary authenticated clients.

## Required environment configuration

Set the same randomly generated secret (at least 32 characters) in Cloudflare Pages Production and the Supabase Edge Function secrets. Do not put the value in Git, source code, a browser variable, issue, chat, or build log.

### Cloudflare Pages

Project: `ompathstudy-main`

The live `/api/neon-functions?name=topic-write` endpoint is routed through the Cloudflare Pages Function at `functions/api/neon-functions.js`, which invokes the shared handler through `runVercelHandler`.

- `NEON_DB_GATEWAY_SECRET`: add as a **Production secret** to the Cloudflare Pages project.
- `DATABASE_URL`: already exists as a Production secret in the project; keep it server-side.
- The project already enables `nodejs_compat` and `nodejs_compat_populate_process_env`, which the handler relies on to read its runtime bindings through `process.env`.

Do not add the gateway secret to Preview. Preview currently has no production database binding and must fail closed. Do not change the existing database secret or its value.

### Supabase

Project: `rcntjfzivtnijnkliouc`, Edge Function: `ompath-ai`

- `NEON_DB_GATEWAY_SECRET`: the same value as the Cloudflare Pages Production secret.
- `NEON_DB_WRITE_URL`: optional override; defaults to `https://www.ompathstudy.com/api/neon-functions?name=topic-write`.
- `NEON_AUTH_JWKS_URL` and `NEON_DATA_API_URL`: retain the verified URLs for the active Neon production branch.

If the shared secret is absent or invalid, topic writes return a controlled failure. There is no fallback to direct user-token writes.

## Verification before deployment

- Run the repository test suite, including `src/test/topic-write-db.test.ts`.
- Confirm the Vercel route rejects a missing/wrong shared secret and invalid Neon JWT.
- Confirm topic publication requires `aiReview.status === "passed"` and a reviewer model identity.
- Confirm deep-note writes use the restricted server-side Neon function.
- Confirm Cloudflare Pages Production has the gateway secret configured, without printing its value.
- After the user authorizes deployment and configures the Supabase secret, run one real authenticated topic generation and one deep-note generation; verify persisted rows by reading them back from Neon.
- Do not treat an HTTP success response alone as proof of persistence.
