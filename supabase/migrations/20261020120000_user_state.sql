-- Per-account state that used to live only in the browser (daily flashcard counts, starred cards, text size, reminders, practice progress), so it follows the email, not the device.
create table if not exists public.user_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.user_state enable row level security;
drop policy if exists "own state read" on public.user_state;
drop policy if exists "own state write" on public.user_state;
create policy "own state read" on public.user_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "own state write" on public.user_state for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
