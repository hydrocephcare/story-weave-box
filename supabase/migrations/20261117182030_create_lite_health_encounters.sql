-- OmpathStudy Lite: private health encounter storage.
-- Access is server-only; do not grant anon/authenticated access.

create table if not exists public.lite_health_encounters (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  phone_number text not null,
  channel text not null default 'ussd' check (channel in ('ussd','sms','web')),
  status text not null default 'intake_started'
    check (status in ('intake_started','awaiting_clarification','ready_for_assessment','referred_urgent','guide_pending','complete','abandoned')),
  consent_given boolean not null default false,
  consented_at timestamptz,
  preferred_language text not null default 'en'
    check (preferred_language in ('en','sw','other')),
  concern_category text,
  original_message text,
  normalized_summary text,
  clarification_answers jsonb not null default '[]'::jsonb,
  red_flag_results jsonb not null default '[]'::jsonb,
  urgency_level text not null default 'not_assessed'
    check (urgency_level in ('not_assessed','emergency','urgent','prompt','routine','uncertain')),
  assessment jsonb,
  guide_url text,
  sms_consent boolean not null default false,
  sms_sent_at timestamptz,
  support_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint lite_health_answers_array check (jsonb_typeof(clarification_answers) = 'array'),
  constraint lite_health_red_flags_array check (jsonb_typeof(red_flag_results) = 'array')
);

create unique index if not exists lite_health_encounters_session_uidx
  on public.lite_health_encounters(session_id);
create index if not exists lite_health_encounters_phone_created_idx
  on public.lite_health_encounters(phone_number, created_at desc);
create index if not exists lite_health_encounters_status_idx
  on public.lite_health_encounters(status, updated_at desc);

alter table public.lite_health_encounters enable row level security;
revoke all on public.lite_health_encounters from anon, authenticated, public;
grant all on public.lite_health_encounters to service_role;
