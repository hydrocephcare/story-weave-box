-- OmpathStudy Lite uses the existing OmpathStudy content as its single source of truth.
-- No duplicate MCQ or topic tables are created here.
create extension if not exists pgcrypto;

create table if not exists public.lite_students (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,
  full_name text not null,
  study_level text not null,
  sms_opt_in boolean not null default false,
  sms_opt_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Attempts point directly to the existing MCQ set and question index.
create table if not exists public.lite_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.lite_students(id) on delete cascade,
  mcq_set_id uuid not null references public.mcq_sets(id) on delete cascade,
  question_index integer not null check (question_index >= 0),
  selected_option smallint not null check (selected_option between 1 and 5),
  is_correct boolean not null,
  attempted_at timestamptz not null default now()
);

create index if not exists lite_attempts_student_date_idx
  on public.lite_attempts(student_id, attempted_at desc);
create index if not exists lite_attempts_set_question_idx
  on public.lite_attempts(mcq_set_id, question_index);

alter table public.lite_students enable row level security;
alter table public.lite_attempts enable row level security;
revoke all on public.lite_students from anon, authenticated;
revoke all on public.lite_attempts from anon, authenticated;

-- Compact aggregate for the Lite dashboard without downloading full MCQ JSON.
create or replace function public.lite_library_summary()
returns table(set_count bigint, question_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint,
         coalesce(sum(jsonb_array_length(case when jsonb_typeof(questions)='array' then questions else '[]'::jsonb end)),0)::bigint
  from public.mcq_sets
  where published = true and deleted_at is null;
$$;
revoke all on function public.lite_library_summary() from public, anon, authenticated;
grant execute on function public.lite_library_summary() to service_role;
