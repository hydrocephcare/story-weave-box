-- OmpathStudy Lite: explicit SMS consent and idempotent delivery tracking.
alter table public.lite_students
  add column if not exists sms_opt_in boolean not null default false,
  add column if not exists sms_opt_in_at timestamptz;

create table if not exists public.lite_sms_deliveries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.lite_students(id) on delete cascade,
  question_id uuid not null references public.lite_questions(id) on delete cascade,
  delivery_date date not null default current_date,
  short_code text not null,
  provider_status text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  unique(student_id, question_id, delivery_date)
);
create index if not exists lite_sms_deliveries_date_idx
  on public.lite_sms_deliveries(delivery_date desc);
alter table public.lite_sms_deliveries enable row level security;
revoke all on public.lite_sms_deliveries from anon, authenticated;
