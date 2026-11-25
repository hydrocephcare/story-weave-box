# OmpathStudy Lite — EdTech

OmpathStudy Lite is a low-bandwidth medical-learning companion for learners who use smartphones and basic phones. It is deployed separately at `https://lite.ompathstudy.com` and uses the existing OmpathStudy Supabase project.

## Learner experience

- Phone-based registration with name, study year and a six-digit PIN.
- Explicit opt-in for learning SMS and separate consent for parent/guardian messages.
- Access to published MCQ sets from the OmpathStudy question bank.
- Daily five-question challenge matched to the learner's study year.
- Immediate marking and explanations after answering.
- Progress totals, correct answers and accuracy.
- Session tokens are random, stored as SHA-256 hashes, and expire after 30 days. PINs are PBKDF2-hashed with a per-user salt.

## Basic-phone experience

The Africa's Talking USSD callback is:

`https://lite.ompathstudy.com/api/ompath-lite-ussd?key=<USSD_CALLBACK_SECRET>`

Menu:
1. Register as a learner
2. Daily quiz
3. My progress
4. Help

The callback receives the caller's phone number and stores quiz attempts in `lite_attempts`. The callback secret is stored as a SHA-256 hash in `lite_operations_settings`; the raw value belongs only in the Africa's Talking callback URL.

Inbound SMS callback:

`https://lite.ompathstudy.com/api/ompath-lite-sms-inbound?key=<USSD_CALLBACK_SECRET>`

Learners can reply `STOP` to opt out. Daily SMS dispatch is available through the protected endpoint `/api/ompath-lite-send-daily-sms` and requires a configured `CRON_SECRET`.

## Teacher and school operations

The administrator dashboard is available at `/admin/ompath-lite-learning` after administrator sign-in. It provides:
- Learner roster and study-year overview.
- MCQ attempt and accuracy summaries.
- Attendance recording.
- Announcement drafts, study-year targeting and consent-aware SMS delivery to opted-in learners and separately opted-in parents.
- Airtime reward requests with an explicit administrator approval/send action.

Announcements are saved as drafts first. An administrator must deliberately send them. Airtime requests remain pending until an administrator approves the send action.

## Africa's Talking configuration

The Edge Function reads these server-side secrets:
- `AT_API_KEY`
- `AT_USERNAME` (use `sandbox` for sandbox testing)
- `AT_ENV` (`sandbox` or `production`)
- `AT_SENDER_ID` (optional, if approved)
- `AT_AIRTIME_ENABLED=true` (required before airtime reward sends)
- `CRON_SECRET` (required for scheduled daily SMS)

The Cloudflare Pages configuration has no Africa's Talking API key. The Edge Function reads `AT_API_KEY` from Supabase Edge Function secrets; verify that it is configured there before expecting outbound SMS or airtime to work. Voice broadcasting and payment collection are not yet wired into this Lite release; they must not be presented as operational.

## Health Support

The previous symptom-intake experience is retained at `https://lite.ompathstudy.com/health-support`. Its health encounter data and APIs are kept separate from learner profiles and quiz attempts.

## Data and security

- Supabase project: existing OmpathStudy project; no separate database.
- `lite_students`, `lite_attempts`, `lite_sms_deliveries`, `lite_announcements`, `lite_attendance`, and `lite_airtime_rewards` have RLS enabled.
- The Edge Function uses the Supabase server key only on the server.
- Browser code receives neither the service-role key nor the correct answer before submission.
- SMS is sent only to learners who explicitly opted in; STOP revokes the opt-in.
- Health-support records are not reused for learning analytics.

## Deployment

Cloudflare Pages project: `ompathstudy-lite`  
Git repository: `hydrocephcare/story-weave-box`  
EdTech development branch: `feat/ompathstudy-lite-edtech`  
The branch is deployed as a preview until the build and end-to-end tests pass. The existing production branch is not changed by this work.
