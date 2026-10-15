-- Saved conversations for the admin assistant: each administrator sees only their own. Safe to run twice.
create table if not exists public.agent_chats (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New task',
  feed jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_chats_owner_idx on public.agent_chats (owner, updated_at desc);
alter table public.agent_chats enable row level security;
revoke all on public.agent_chats from anon, authenticated;
grant select, insert, update, delete on public.agent_chats to authenticated;

drop policy if exists "admins read own chats" on public.agent_chats;
create policy "admins read own chats" on public.agent_chats for select to authenticated
  using (owner = (select auth.uid()) and public.has_role((select auth.uid()), 'admin'));
drop policy if exists "admins create own chats" on public.agent_chats;
create policy "admins create own chats" on public.agent_chats for insert to authenticated
  with check (owner = (select auth.uid()) and public.has_role((select auth.uid()), 'admin'));
drop policy if exists "admins update own chats" on public.agent_chats;
create policy "admins update own chats" on public.agent_chats for update to authenticated
  using (owner = (select auth.uid()) and public.has_role((select auth.uid()), 'admin'))
  with check (owner = (select auth.uid()) and public.has_role((select auth.uid()), 'admin'));
drop policy if exists "admins delete own chats" on public.agent_chats;
create policy "admins delete own chats" on public.agent_chats for delete to authenticated
  using (owner = (select auth.uid()) and public.has_role((select auth.uid()), 'admin'));

notify pgrst, 'reload schema';
