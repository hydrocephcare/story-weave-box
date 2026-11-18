# OmpathStudy Lite — model-backed extraction contract

**Status: adapter scaffold only; not connected to the USSD flow and not enabled for patient traffic.**

The optional model adapter in `api/_lib/ompathLiteAi.js` uses the existing server-side Groq/Gemini JSON provider helper. It is deliberately separate from the deterministic emergency detector and preliminary assessment rules.

## Structured extraction

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

This commit adds a provider adapter and a strict output validator with unit tests. It does **not** wire the adapter into the USSD callback, does not activate model inference, and does not alter Supabase schema or main OmpathStudy production. The existing deterministic phrase matcher remains the only live interpretation path.
