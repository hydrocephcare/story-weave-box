# OmpathStudy Lite — USSD MVP

A low-bandwidth medical-learning channel for students using basic phones. This module is isolated from the main OmpathStudy web experience.

## MVP scope
- Africa's Talking USSD menu and callback.
- Phone-number registration and study-level capture.
- Daily MCQ retrieval, answer submission and explanation.
- Attempt records for later learner progress summaries.

## 1. Database
Apply `supabase/migrations/202611170001_ompathstudy_lite.sql` to the OmpathStudy Supabase project. It creates three isolated `lite_*` tables and seeds one demonstration question.

## 2. Server environment
Set these in the Vercel project environment (never in frontend code):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The Africa's Talking USSD callback currently needs no AT API key; the key will be needed for outbound SMS in the next milestone.

## 3. Africa's Talking configuration
Create a USSD service code in the Africa's Talking dashboard/sandbox and set its callback URL to:

`https://YOUR-DEPLOYMENT/api/ompath-lite`

Configure the callback to send the standard fields `sessionId`, `serviceCode`, `phoneNumber` and `text`. The service code itself is provisioned by Africa's Talking; `*384#` is only an illustrative code and is not assumed to be assigned.

## 4. Test flow
1. Dial the sandbox service code.
2. Select Register, enter a name, then choose a study level.
3. Return to the main menu and choose Daily medical MCQ.
4. Select an answer from 1–4 and confirm feedback.
5. Confirm rows are created in `lite_students` and `lite_attempts`.

## Security and deployment notes
- The handler uses the Supabase service-role key only on the server.
- RLS is enabled and no browser-facing policies are created.
- Do not enable public database access to student phone numbers or attempts.
- Add rate limiting, duplicate-session handling and consent/privacy wording before production launch.
- This is a learning prototype, not a source of clinical decision support. Questions require review by a qualified medical educator before publication.
