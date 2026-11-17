-- SMS delivery ledger for OmpathStudy Lite.
-- Questions continue to come from the existing public.mcq_sets table.
create table if not exists public.lite_sms_deliveries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.lite_students(id) on delete cascade,
  mcq_set_id uuid not null references public.mcq_sets(id) on delete cascade,
  question_index integer not null check (question_index >= 0),
  delivery_date date not null default (now() at time zone 'utc')::date,
  short_code text not null check (short_code ~ '^[A-F0-9]{8}$'),
  provider_status text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  unique (student_id, delivery_date),
  unique (student_id, delivery_date, short_code)
);
create index if not exists lite_sms_deliveries_lookup_idx
  on public.lite_sms_deliveries(student_id, delivery_date, short_code);
alter table public.lite_sms_deliveries enable row level security;
revoke all on public.lite_sms_deliveries from anon, authenticated;
grant all on public.lite_sms_deliveries to service_role;
