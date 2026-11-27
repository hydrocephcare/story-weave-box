# OmpathStudy AI gateway

Endpoint: `POST https://rcntjfzivtnijnkliouc.supabase.co/functions/v1/ompath-ai`

The gateway centralises model execution on Supabase and reuses the existing
`supabase/functions/_shared/aiChat.js` provider router. It preserves Groq and
Gemini key rotation, provider/model fallback, cooldowns and the existing
medical prompts supplied by the calling feature.

Neon remains authoritative for identity and entitlements. The gateway verifies
the Neon Auth JWT using its JWKS and calls Neon Data API
`rpc/consume_feature` before spending a model request.

Required Supabase Edge Function secrets:
- `GROQ_API_KEYS` (comma- or newline-separated; existing helper also accepts `GROQ_API_KEY`)
- `GEMINI_API_KEYS` (comma- or newline-separated; existing helper also accepts `GEMINI_API_KEY`)

Optional:
- `GROQ_API_KEYS_EXTRA`
- `NEON_AUTH_JWKS_URL`
- `NEON_DATA_API_URL`

Request JSON:
```json
{
  "feature": "ai_chat",
  "messages": [
    {"role": "system", "content": "Existing Ompath feature instructions"},
    {"role": "user", "content": "Question"}
  ],
  "temperature": 0.2,
  "max_tokens": 3000
}
```

This first gateway release is additive. Existing /api/ai task handlers and
Supabase AI publishing functions are not removed or rewritten. Frontend
migration must be performed feature-by-feature after confirming each feature's
entitlement key and request/response contract. Do not switch production routes
until provider secrets are installed and authenticated smoke tests pass.
