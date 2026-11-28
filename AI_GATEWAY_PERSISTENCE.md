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

Set the same randomly generated secret (at least 32 characters) in both locations. Do not put the value in Git, source code, a browser variable, issue, chat, or build log.

### Vercel

Project: `story-weave-box-j8ry`

- `NEON_DB_GATEWAY_SECRET`: sensitive environment variable, **Production only**.
- `DATABASE_URL`: existing server-side Neon connection; do not expose it through a `VITE_` variable.

Do not add the gateway secret to Preview or Development targets. Preview deployments must fail closed unless a separate non-production database and secret are deliberately configured.

### Supabase

Project: `rcntjfzivtnijnkliouc`, Edge Function: `ompath-ai`

- `NEON_DB_GATEWAY_SECRET`: the same value as the Vercel Production secret.
- `NEON_DB_WRITE_URL`: optional override; defaults to `https://www.ompathstudy.com/api/neon-functions?name=topic-write`.
- `NEON_AUTH_JWKS_URL` and `NEON_DATA_API_URL`: retain the verified URLs for the active Neon production branch.

If the shared secret is absent or invalid, topic writes return a controlled failure. There is no fallback to direct user-token writes.

## Verification before deployment

- Run the repository test suite, including `src/test/topic-write-db.test.ts`.
- Confirm the Vercel route rejects a missing/wrong shared secret and invalid Neon JWT.
- Confirm topic publication requires `aiReview.status === "passed"` and a reviewer model identity.
- Confirm deep-note writes use the restricted server-side Neon function.
- After the user authorizes deployment and configures the secret, run one real authenticated topic generation and one deep-note generation; verify persisted rows by reading them back from Neon.
- Do not treat an HTTP success response alone as proof of persistence.
