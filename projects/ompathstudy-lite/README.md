# OmpathStudy Lite — USSD and SMS access channel

OmpathStudy Lite is an alternative low-bandwidth interface to the existing OmpathStudy learning platform. It does not maintain a separate MCQ or topic library.

## Content source of truth
- Published questions are read directly from `public.mcq_sets`.
- Question options, correct answers and explanations come from the existing `questions` JSONB array.
- Published topics and units are read from the existing OmpathStudy catalogue.
- Lite answer attempts reference the original `mcq_sets.id` and question index.
- No duplicate MCQ table is created and Lite administrators do not re-enter questions.

## Lite-specific data
The migration creates only:
- `lite_students`: phone-based USSD learner registrations and SMS consent.
- `lite_attempts`: answers submitted through the Lite channel, linked to the original OmpathStudy MCQ set and question index.

It also creates a restricted aggregate function for the admin dashboard to count published MCQs without downloading all question JSON.

## Server environment
Vercel requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` server-side. The admin API additionally validates the signed-in user's Supabase session and checks the existing `has_role(admin)` function. Never expose the service-role key in frontend code.

## Africa's Talking
Configure the USSD callback to `https://YOUR-DEPLOYMENT/api/ompath-lite`. The service code is provisioned by Africa's Talking; do not assume a short code has been assigned.

## Testing
1. Apply `supabase/migrations/202611170001_ompathstudy_lite.sql` to the correct OmpathStudy Supabase project.
2. Deploy a Vercel preview and configure the Africa's Talking sandbox callback.
3. Register a test learner, browse an existing published MCQ set and answer a question.
4. Verify that the attempt stores the original MCQ set ID and question index.
5. Visit `/admin/ompath-lite` as an administrator to inspect library coverage, learners and answer activity.

## Safety
This is an educational channel, not clinical decision support. Use the same reviewed/published OmpathStudy content and its existing answer explanations. Add provider callback verification, rate limiting and explicit SMS consent handling before production launch.
