create table if not exists public.mcq_practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mcq_set_id uuid not null references public.mcq_sets(id) on delete cascade,
  session_id text not null,
  score integer not null default 0 check (score >= 0),
  attempted integer not null default 0 check (attempted >= 0),
  total integer not null check (total >= 0),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  timer_minutes integer null check (timer_minutes is null or timer_minutes between 1 and 240),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint mcq_practice_attempts_user_session_unique unique (user_id, session_id),
  constraint mcq_practice_attempts_score_bounds check (score <= attempted and attempted <= total)
);

create index if not exists mcq_practice_attempts_user_set_completed_idx
  on public.mcq_practice_attempts (user_id, mcq_set_id, completed_at desc);

alter table public.mcq_practice_attempts enable row level security;

drop policy if exists "Students read their own MCQ practice attempts" on public.mcq_practice_attempts;
create policy "Students read their own MCQ practice attempts"
  on public.mcq_practice_attempts for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Students insert their own MCQ practice attempts" on public.mcq_practice_attempts;
create policy "Students insert their own MCQ practice attempts"
  on public.mcq_practice_attempts for insert to authenticated
  with check ((select auth.uid()) = user_id);

grant select, insert on public.mcq_practice_attempts to authenticated;
revoke all on public.mcq_practice_attempts from anon;
