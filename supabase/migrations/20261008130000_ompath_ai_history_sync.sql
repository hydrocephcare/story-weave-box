-- Ompath AI: a signed-in student's chats follow their account, so they are there on a new phone or laptop.
-- Run once in the Supabase SQL editor. Each student can only ever see and change their own row.

create table if not exists public.ai_user_history (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb check (pg_column_size(data) < 400000),
  updated_at timestamptz not null default now()
);

alter table public.ai_user_history enable row level security;
grant select, insert, update, delete on public.ai_user_history to authenticated;

drop policy if exists "own ai history" on public.ai_user_history;
create policy "own ai history" on public.ai_user_history for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
