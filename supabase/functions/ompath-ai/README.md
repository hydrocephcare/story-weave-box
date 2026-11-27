# OmpathStudy AI gateway

Deployed Supabase Edge Function: `ompath-ai`
Endpoint: `https://rcntjfzivtnijnkliouc.supabase.co/functions/v1/ompath-ai`

This is an additive central AI execution gateway. It keeps Groq/Gemini credentials
server-side, rotates configured keys and models, alternates provider priority,
and cools down recently rate-limited or missing models. Existing feature prompts
and task-specific handlers remain in the repository; they must be migrated one
at a time after their request/response contracts and quota feature names are
verified. This gateway is not a replacement for every existing AI task yet.

Neon remains authoritative for user identity and entitlements. The gateway
validates Neon Auth access tokens against the configured JWKS and calls the
Neon Data API `rpc/consume_feature` before sending a request to a model.

## Supabase Edge Function secrets

Required:
- `NEON_AUTH_JWKS_URL` — the exact Neon Auth JWKS URL used by the production app
- `NEON_DATA_API_URL` — Neon Data API REST base URL ending in `/rest/v1`
- `GROQ_API_KEYS` — one or more rotated Groq keys, comma- or newline-separated
- `GEMINI_API_KEYS` — one or more rotated Gemini keys, comma- or newline-separated

Optional:
- `GROQ_API_KEYS_EXTRA` — additional Groq keys for fallback rotation

Never commit these values or paste them into chat. Rotate any credentials previously
exposed in repository history before enabling production traffic.

## Request

```json
{
  "feature": "ai_chat",
  "messages": [
    {"role": "system", "content": "The existing Ompath feature prompt"},
    {"role": "user", "content": "Question"}
  ],
  "temperature": 0.2,
  "max_tokens": 3000
}
```

The `feature` value must match a feature supported by the Neon
`consume_feature` RPC. The response uses an OpenAI-compatible
`choices[0].message.content` shape. The current endpoint is non-streaming.

## Safe rollout

1. Install the four required secrets in Supabase Dashboard > Edge Functions > Secrets.
2. Smoke-test with a valid Neon user JWT and a known allowed feature.
3. Migrate one caller at a time, preserving its existing prompt, payload, UI,
   streaming expectations, and error handling.
4. Keep Neon as the primary database. Do not migrate payments, publishing,
   login, SEO, or unrelated data routes as part of this AI gateway rollout.
