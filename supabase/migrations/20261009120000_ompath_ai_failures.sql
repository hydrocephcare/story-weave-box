-- Ompath AI: a record of the times the assistant failed for a student, so the admin can see them (Admin > AI health).
-- Run this once in the Supabase SQL editor (the app works without it; failures are simply not recorded).

create table if not exists public.ai_failures (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'answer' check (kind in ('answer','search','quiz','essay','paper','drill','other')),
  question   text check (length(question) <= 300),
  message    text check (length(message) <= 300),
  fallback   text check (length(fallback) <= 80),
  page       text check (length(page) <= 120),
  created_at timestamptz not null default now()
);

alter table public.ai_failures enable row level security;
grant select, insert, delete on public.ai_failures to authenticated;
grant insert on public.ai_failures to anon;

-- any visitor's device can report a failure, but only an admin can read or clear the list
drop policy if exists "ai failures add" on public.ai_failures;
create policy "ai failures add" on public.ai_failures for insert with check (true);

drop policy if exists "ai failures admin read" on public.ai_failures;
create policy "ai failures admin read" on public.ai_failures for select using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "ai failures admin clear" on public.ai_failures;
create policy "ai failures admin clear" on public.ai_failures for delete using (public.has_role(auth.uid(), 'admin'));

create index if not exists ai_failures_created_idx on public.ai_failures (created_at desc);
