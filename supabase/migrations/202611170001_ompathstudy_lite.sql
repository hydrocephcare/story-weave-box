-- OmpathStudy Lite: USSD student registration, question bank and attempts.
-- Apply through the Supabase SQL editor or Supabase CLI.
create extension if not exists pgcrypto;

create table if not exists public.lite_students (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,
  full_name text not null,
  study_level text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lite_questions (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_option smallint not null check (correct_option between 1 and 4),
  explanation text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.lite_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.lite_students(id) on delete cascade,
  question_id uuid not null references public.lite_questions(id) on delete cascade,
  selected_option smallint not null check (selected_option between 1 and 4),
  is_correct boolean not null,
  attempted_at timestamptz not null default now(),
  unique (student_id, question_id)
);

create index if not exists lite_attempts_student_date_idx
  on public.lite_attempts(student_id, attempted_at desc);
create index if not exists lite_questions_active_date_idx
  on public.lite_questions(is_active, created_at desc);

alter table public.lite_students enable row level security;
alter table public.lite_questions enable row level security;
alter table public.lite_attempts enable row level security;

-- No anon/authenticated policies: all writes/reads currently go through the
-- server-side USSD handler using the Supabase service-role key.
revoke all on public.lite_students from anon, authenticated;
revoke all on public.lite_questions from anon, authenticated;
revoke all on public.lite_attempts from anon, authenticated;

insert into public.lite_questions
  (question, option_a, option_b, option_c, option_d, correct_option, explanation, is_active)
select
  'Which hormone maintains the corpus luteum during early pregnancy?',
  'Follicle-stimulating hormone (FSH)',
  'Luteinising hormone (LH)',
  'Human chorionic gonadotrophin (hCG)',
  'Prolactin',
  3,
  'hCG, produced by the syncytiotrophoblast, rescues and maintains the corpus luteum in early pregnancy until placental steroid production is established.',
  true
where not exists (select 1 from public.lite_questions);
