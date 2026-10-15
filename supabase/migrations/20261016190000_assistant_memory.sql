-- Admin assistant extras: things it should remember between tasks, an "auto-run safe steps" switch, and a one-tap clean-up of your own notification bell.
-- Needs 20261016160000_autopilot.sql first. Safe to run twice.

create table if not exists public.agent_memory (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  note text not null check (char_length(note) between 3 and 400),
  at timestamptz not null default now()
);
create index if not exists agent_memory_owner_idx on public.agent_memory (owner, at desc);
alter table public.agent_memory enable row level security;
revoke all on public.agent_memory from anon, authenticated;
grant select, insert, delete on public.agent_memory to authenticated;
drop policy if exists "admins read own memory" on public.agent_memory;
create policy "admins read own memory" on public.agent_memory for select to authenticated using (owner = (select auth.uid()) and public.has_role((select auth.uid()), 'admin'));
drop policy if exists "admins add own memory" on public.agent_memory;
create policy "admins add own memory" on public.agent_memory for insert to authenticated with check (owner = (select auth.uid()) and public.has_role((select auth.uid()), 'admin'));
drop policy if exists "admins delete own memory" on public.agent_memory;
create policy "admins delete own memory" on public.agent_memory for delete to authenticated using (owner = (select auth.uid()) and public.has_role((select auth.uid()), 'admin'));

-- off / ask / auto: "auto" lets the assistant carry out safe steps without showing a confirm card (deleting and messaging students always ask).
insert into public.agent_capabilities (key, title, description, mode, sort) values
  ('assistant_autorun', 'Assistant runs safe steps itself', 'Ask me: the assistant shows a confirm card before every change. Auto: it carries out safe steps (creating, publishing, fixing) straight away and shows you the result with an Undo. Deleting things and messaging students always ask first.', 'ask', 30)
on conflict (key) do update set title = excluded.title, description = excluded.description, sort = excluded.sort;

-- Clears YOUR notification bell: marks everything read and removes read ones older than p_days.
create or replace function public.admin_clean_my_notifications(p_days integer default 14)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare marked integer; removed integer;
begin
  if not public.has_role((select auth.uid()), 'admin') then raise exception 'Administrator access required'; end if;
  update public.user_notifications set read_at = now() where user_id = (select auth.uid()) and read_at is null;
  get diagnostics marked = row_count;
  delete from public.user_notifications where user_id = (select auth.uid()) and read_at is not null and created_at < now() - make_interval(days => greatest(coalesce(p_days, 14), 0));
  get diagnostics removed = row_count;
  return jsonb_build_object('marked_read', marked, 'removed', removed);
end $$;
revoke all on function public.admin_clean_my_notifications(integer) from public, anon;
grant execute on function public.admin_clean_my_notifications(integer) to authenticated;

notify pgrst, 'reload schema';
