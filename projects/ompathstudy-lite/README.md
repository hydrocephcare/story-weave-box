# OmpathStudy Lite — Health Support

OmpathStudy Lite is a focused, low-bandwidth health-support experience at `https://lite.ompathstudy.com`. It is not a second medical-learning platform.

## Product boundary

- Lite provides health concern intake, emergency warning-sign screening, adaptive symptom questions, a preliminary clinical impression, differential considerations, urgency guidance and clinician-directed evaluation suggestions.
- Lite does not provide MCQs, past papers, flashcards, learning progress, learner registration or daily learning messages.
- Medical learning is on the main website: `https://www.ompathstudy.com`.
- The main website remains hosted on Vercel. Lite remains on Cloudflare Pages.
- Both use the existing Supabase project. There is no separate Lite question bank or database project.

## Web experience

- Anonymous web assessment; no name or phone number is requested.
- Explicit consent is required before a health encounter is stored.
- Health answers are retained for up to 30 days.
- The assessment result distinguishes a preliminary impression from a confirmed diagnosis.
- Emergency and urgent cases receive immediate care-seeking guidance.
- Only reviewed, published patient-facing information may be linked as supporting reading.
- The admin dashboard exposes de-identified operational activity only.

## USSD experience

- Short health-support menu with English and Kiswahili.
- Explicit consent before storing health information.
- Adaptive question pathways for pregnancy/maternity concerns, menstrual problems, lower abdominal pain, vaginal discharge, bleeding and other symptoms.
- Emergency screening interrupts routine clarification.
- Invalid choices are re-prompted; back navigation preserves the current flow.
- The USSD channel uses the caller number for session matching. The web channel does not store a phone number.

## Clinical and safety boundary

The current engine is deterministic and rule-based. It does not send symptom text to external AI providers, is not a diagnostic device and does not produce confirmed diagnoses. It provides a preliminary intake impression and triage recommendation from the information supplied.

It must not:
- Claim that examination, vital signs, pregnancy testing or investigations have been performed.
- Infer a pregnancy, gestational age, symptom duration or severity that was not supplied.
- Downgrade a red flag because of a later reassuring answer.
- Recommend delaying emergency care to finish the intake.
- Prescribe treatment or replace assessment by a qualified clinician.

## Server configuration

Cloudflare Pages production requires the server-side variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The USSD callback is:
- `https://lite.ompathstudy.com/api/ompath-lite`

The web assessment endpoint is:
- `https://lite.ompathstudy.com/api/ompath-lite-web`

The service-role key must never be exposed in browser code. The health encounter table has RLS enabled and no public policies.

## Verification

The Lite CI workflow runs the clinical rules, adaptive question flow, health persistence, USSD formatting, web API and end-to-end USSD tests, followed by the frontend/Pages build.

Before enabling any live SMS delivery, separately verify provider credentials, explicit consent, delivery logs and opt-out handling. The Lite public UI currently states that it does not send SMS.
