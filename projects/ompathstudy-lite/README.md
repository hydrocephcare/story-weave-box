# OmpathStudy Lite — USSD MVP

A low-bandwidth medical-learning channel for students using basic phones. This module is isolated from the main OmpathStudy web experience and reuses the existing serverless API multiplexer.

## MVP scope
- Africa's Talking USSD menu and callback.
- Phone-number registration and study-level capture.
- Daily MCQ retrieval, answer submission and explanation.
- Attempt records for later learner progress summaries.

## Database
Apply `supabase/migrations/202611170001_ompathstudy_lite.sql` to the OmpathStudy Supabase project. It creates three isolated `lite_*` tables and seeds one demonstration question.

## Server environment
Ensure the Vercel project has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` configured server-side. Never expose the service-role key in frontend code.

## Africa's Talking configuration
Create a USSD service code in the Africa's Talking dashboard/sandbox and set its callback URL to:

`https://YOUR-DEPLOYMENT/api/ompath-lite`

The Vercel rewrite forwards this to the existing API function. Configure the callback to send `sessionId`, `serviceCode`, `phoneNumber` and `text`. The service code is provisioned by Africa's Talking; `*384#` is illustrative only and is not assumed to be assigned.

## Test flow
1. Apply the SQL migration.
2. Deploy the branch to a preview environment.
3. Create/configure a USSD service code with the preview callback URL.
4. Dial the sandbox service code, register, then dial again.
5. Choose Daily medical MCQ and submit an answer.
6. Confirm rows in `lite_students` and `lite_attempts`.

## Security and clinical quality
- RLS is enabled and no browser-facing policies are created.
- Database access uses the service-role key only in the serverless handler.
- Add callback verification where supported, rate limiting, consent/privacy wording and session replay protection before production launch.
- This is an educational prototype, not clinical decision support. A qualified medical educator must review questions and explanations before publication.
