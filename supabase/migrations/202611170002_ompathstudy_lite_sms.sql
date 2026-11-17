-- OmpathStudy Lite SMS delivery ledger.
-- SMS questions are selected from the existing published mcq_sets JSON; no separate bank.
create table if not exists public.lite_sms_deliveries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.lite_students(id) on delete cascade,
  mcq_set_id uuid not null references public.mcq_sets(id) on delete cascade,
  question_index integer not null check (question_index >= 0),
  delivery_date date not null default current_date,
  short_code varchar(8) not null,
  provider_status text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  unique(student_id, delivery_date),
  unique(student_id, short_code, delivery_date)
);
create index if not exists lite_sms_deliveries_date_idx
  on public.lite_sms_deliveries(delivery_date desc);
create index if not exists lite_sms_deliveries_student_idx
  on public.lite_sms_deliveries(student_id, delivery_date desc);
alter table public.lite_sms_deliveries enable row level security;
revoke all on public.lite_sms_deliveries from anon, authenticated;
