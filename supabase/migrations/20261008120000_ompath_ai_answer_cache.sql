-- Ompath AI: answers shared by every student, so a question is paid for once and answered instantly for everyone after that.
-- Run this once in the Supabase SQL editor (the app works without it, it just cannot share answers).

create table if not exists public.ai_answer_cache (
  cache_key  text primary key check (length(cache_key) between 2 and 200),
  question   text not null check (length(question) between 2 and 400),
  answer     text not null check (length(answer) between 40 and 8000),
  grounded   boolean not null default true,
  uses       integer not null default 0,
  reports    integer not null default 0,
  created_at timestamptz not null default now(),
  last_used  timestamptz not null default now()
);

alter table public.ai_answer_cache enable row level security;
grant select, insert on public.ai_answer_cache to anon, authenticated;

-- anyone can read answers that have not been reported twice
drop policy if exists "ai cache read" on public.ai_answer_cache;
create policy "ai cache read" on public.ai_answer_cache for select using (reports < 2);

-- anyone can add a new answer, but never change or delete one (a clash on the same question is ignored by the app)
drop policy if exists "ai cache add" on public.ai_answer_cache;
create policy "ai cache add" on public.ai_answer_cache for insert with check (uses = 0 and reports = 0);

-- counters go through these two functions only
create or replace function public.ai_cache_touch(k text) returns void language sql security definer set search_path = public as
$$ update public.ai_answer_cache set uses = uses + 1, last_used = now() where cache_key = k $$;

create or replace function public.ai_cache_report(k text) returns void language sql security definer set search_path = public as
$$ update public.ai_answer_cache set reports = reports + 1 where cache_key = k $$;

grant execute on function public.ai_cache_touch(text), public.ai_cache_report(text) to anon, authenticated;

-- most-asked questions, for the "Trending" suggestions
create or replace function public.ai_cache_trending(n integer default 6) returns table(question text) language sql stable security definer set search_path = public as
$$ select question from public.ai_answer_cache where reports < 2 order by uses desc, created_at desc limit least(n, 12) $$;
grant execute on function public.ai_cache_trending(integer) to anon, authenticated;
