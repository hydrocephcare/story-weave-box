# OmpathStudy Lite — model-backed extraction contract

**Status: connected to a Cloudflare Pages background task behind an explicit feature flag; disabled by default and not enabled for patient traffic.**

The optional model adapter in `api/_lib/ompathLiteAi.js` uses the existing server-side Groq/Gemini JSON provider helper. It is deliberately separate from the deterministic emergency detector and preliminary assessment rules.

## Structured extraction

The USSD callback schedules this adapter through the Cloudflare Pages execution context (`waitUntil`) after the normal USSD response is ready. It does not block the carrier response. Only the patient's free-text symptom description is sent; phone number, session ID and other direct identifiers are not included. Successful extraction is appended to `normalized_summary` as `AI extraction (unverified)`. The original message is preserved. The annotation is not used by the assessment or urgency rules.

To activate in a controlled test environment, set `LITE_AI_INTERPRETATION_ENABLED=true` and configure a supported server-side provider key (`GROQ_API_KEY`/`GROQ_API_KEYS` or `GEMINI_API_KEY`/`GEMINI_API_KEYS`) in the Lite Pages project. Keep the flag unset/false in production until clinician and language validation, monitoring and a cost limit are in place.

The adapter requests only:
- A bounded list of symptom concept IDs from the existing Lite vocabulary
- Explicitly stated negated symptoms
- Patient-stated onset and duration
- Patient-described severity
- Explicit pregnancy context
- A confidence level and uncertainty flag

Unknown symptom concepts are discarded. Negated symptoms are removed from the positive symptom list. Low-confidence or uncertain model output cannot add concepts to the deterministic result.

## Safety requirements

1. The original patient message remains the source record and must never be overwritten.
2. The deterministic emergency screen runs independently and before any optional model call.
3. AI output must never downgrade urgency, clear a red flag, diagnose, prescribe, or delay the USSD response.
4. Run inference only in a background task after the carrier response is returned; carrier USSD response windows are too short for an LLM dependency.
5. If the provider is unavailable, times out, returns malformed JSON, or fails schema validation, retain the deterministic interpretation unchanged.
6. Do not send phone numbers, names, session IDs, or other identifiers to the model. Send only the caller's symptom text.
7. Keep the feature disabled until the Lite Pages project has an approved AI provider binding/secret, a cost limit, monitoring, and clinician/language review.

## Current status

The provider adapter is now wired to a Cloudflare Pages background task, with regression tests for the feature flag, prompt privacy, schema filtering and separation from clinical assessment. The feature remains disabled unless the explicit flag is enabled in the Lite environment. No Supabase schema change is required. The deterministic phrase matcher remains the only active interpretation path while the flag is off. Main OmpathStudy production is not modified.
