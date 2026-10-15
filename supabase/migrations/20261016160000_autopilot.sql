-- Ompath Autopilot: jobs the site does by itself, each with its own switch (off / ask me / auto), a log of everything it did (with undo) and a queue of
-- things it wants you to decide. Nothing here deletes anything. Safe to run twice.

create table if not exists public.agent_capabilities (
  key text primary key,
  title text not null,
  description text not null,
  mode text not null default 'ask' check (mode in ('off', 'ask', 'auto')),
  sort integer not null default 100,
  updated_at timestamptz not null default now()
);
create table if not exists public.agent_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  capability text not null,
  summary text not null,
  detail jsonb not null default '{}'::jsonb,
  undo jsonb,
  undone_at timestamptz
);
create index if not exists agent_log_at_idx on public.agent_log (at desc);
create table if not exists public.agent_proposals (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  capability text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  decided_at timestamptz
);
create index if not exists agent_proposals_status_idx on public.agent_proposals (status, at desc);
create table if not exists public.agent_state (
  id integer primary key default 1 check (id = 1),
  last_run_at timestamptz,
  last_digest_day date
);
insert into public.agent_state (id) values (1) on conflict do nothing;

alter table public.agent_capabilities enable row level security;
alter table public.agent_log enable row level security;
alter table public.agent_proposals enable row level security;
alter table public.agent_state enable row level security;
revoke all on public.agent_capabilities, public.agent_log, public.agent_proposals, public.agent_state from anon, authenticated;
grant select on public.agent_capabilities, public.agent_log, public.agent_proposals, public.agent_state to authenticated;
drop policy if exists "admins read agent capabilities" on public.agent_capabilities;
create policy "admins read agent capabilities" on public.agent_capabilities for select to authenticated using (public.has_role((select auth.uid()), 'admin'));
drop policy if exists "admins read agent log" on public.agent_log;
create policy "admins read agent log" on public.agent_log for select to authenticated using (public.has_role((select auth.uid()), 'admin'));
drop policy if exists "admins read agent proposals" on public.agent_proposals;
create policy "admins read agent proposals" on public.agent_proposals for select to authenticated using (public.has_role((select auth.uid()), 'admin'));
drop policy if exists "admins read agent state" on public.agent_state;
create policy "admins read agent state" on public.agent_state for select to authenticated using (public.has_role((select auth.uid()), 'admin'));

-- approve_access starts on "ask me": it queues the likely students for one tap and approves nobody by itself.
insert into public.agent_capabilities (key, title, description, mode, sort) values
  ('approve_access', 'Approve book access', 'Finds students whose admission number only differs by punctuation (for example "BMS 2023 60482"), or who use an MKU email, and asks you to approve them with one tap. Never denies anyone.', 'ask', 10),
  ('daily_digest', 'Daily digest', 'Once a day: visitors, new accounts, and what is waiting for you, written to the log.', 'auto', 20)
on conflict (key) do update set title = excluded.title, description = excluded.description, sort = excluded.sort;

create schema if not exists private;

create or replace function private.agent_mode(p_key text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select mode from public.agent_capabilities where key = p_key), 'off')
$$;

-- Does this pending request look like a real MKU student that only mistyped? A rule, not a guess: it needs a year and a number, or an MKU email.
create or replace function private.agent_access_ok(p_entered text, p_email text, p_uid uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare digits text := regexp_replace(coalesce(p_entered, ''), '[^0-9]', '', 'g'); yr text; num text;
begin
  if lower(coalesce(p_email, '')) ~ '@(students\.)?mku\.ac\.ke$' then return 'MKU email address'; end if;
  if upper(coalesce(p_entered, '')) ~ '^[[:space:]]*BMS' and length(digits) between 7 and 10 then
    yr := left(digits, 4); num := substr(digits, 5);
    if yr::int between 2010 and extract(year from now())::int + 1 then
      if exists (select 1 from public.student_access s where s.status = 'verified' and s.user_id <> p_uid and s.admission_no = 'BMS/' || yr || '/' || num) then return null; end if;
      return 'admission number with a year and a number, only the punctuation differed';
    end if;
  end if;
  return null;
end $$;

create or replace function private.agent_core() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record; reason text; approved int := 0; queued int := 0; mode text;
  digest jsonb; today date := (now() at time zone 'Africa/Nairobi')::date; v24 bigint := 0; vis24 bigint := 0; newu bigint := 0; pend bigint := 0; appeals bigint := 0;
begin
  mode := private.agent_mode('approve_access');
  if mode <> 'off' and to_regclass('public.student_access') is not null then
    for r in select user_id, email, entered_text from public.student_access where status = 'pending' loop
      reason := private.agent_access_ok(r.entered_text, r.email, r.user_id);
      if reason is null then continue; end if;
      if mode = 'auto' then
        update public.student_access set status = 'verified', method = 'admin', note = 'Approved by Autopilot: ' || reason, admin_seen = true, reviewed_at = now() where user_id = r.user_id and status = 'pending';
        insert into public.agent_log (capability, summary, detail, undo)
        values ('approve_access', 'Approved ' || coalesce(r.email, 'a student') || ' for book access (' || reason || ').', jsonb_build_object('user_id', r.user_id, 'entered', r.entered_text, 'reason', reason), jsonb_build_object('type', 'access_back_to_pending', 'user_id', r.user_id));
        approved := approved + 1;
      elsif not exists (select 1 from public.agent_proposals p where p.capability = 'approve_access' and p.status = 'pending' and p.payload->>'user_id' = r.user_id::text) then
        insert into public.agent_proposals (capability, summary, payload) values ('approve_access', 'Approve ' || coalesce(r.email, 'a student') || ' for book access? They typed "' || coalesce(r.entered_text, '') || '" (' || reason || ').', jsonb_build_object('user_id', r.user_id, 'reason', reason));
        queued := queued + 1;
      end if;
    end loop;
  end if;

  if private.agent_mode('daily_digest') <> 'off' and coalesce((select last_digest_day from public.agent_state where id = 1), date '2000-01-01') < today then
    if to_regclass('public.site_visits') is not null then execute 'select count(*), count(distinct visitor) from public.site_visits where at > now() - interval ''24 hours''' into v24, vis24; end if;
    select count(*) into newu from auth.users where created_at > now() - interval '24 hours';
    if to_regclass('public.student_access') is not null then select count(*) into pend from public.student_access where status = 'pending'; end if;
    if to_regclass('public.contest_appeals') is not null then select count(*) into appeals from public.contest_appeals where status in ('open', 'reviewing'); end if;
    digest := jsonb_build_object('visits', v24, 'visitors', vis24, 'new_accounts', newu, 'access_waiting', pend, 'appeals_open', appeals);
    insert into public.agent_log (capability, summary, detail) values ('daily_digest', 'Last 24 hours: ' || v24 || ' page views from ' || vis24 || ' visitors, ' || newu || ' new accounts. Waiting for you: ' || pend || ' access requests, ' || appeals || ' contest appeals.', digest);
    update public.agent_state set last_digest_day = today where id = 1;
  end if;

  update public.agent_state set last_run_at = now() where id = 1;
  return jsonb_build_object('approved', approved, 'queued', queued);
end $$;
revoke all on function private.agent_mode(text), private.agent_access_ok(text, text, uuid), private.agent_core() from public, anon, authenticated;

-- Admin: run everything now (the admin pages call this when opened; the hourly schedule below calls the core directly).
create or replace function public.admin_agent_run() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role((select auth.uid()), 'admin') then raise exception 'Administrator access required'; end if;
  return private.agent_core();
end $$;

create or replace function public.admin_agent_set_mode(p_key text, p_mode text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role((select auth.uid()), 'admin') then raise exception 'Administrator access required'; end if;
  if p_mode not in ('off', 'ask', 'auto') then raise exception 'Unknown mode'; end if;
  update public.agent_capabilities set mode = p_mode, updated_at = now() where key = p_key;
end $$;

create or replace function public.admin_agent_decide(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  if not public.has_role((select auth.uid()), 'admin') then raise exception 'Administrator access required'; end if;
  select * into p from public.agent_proposals where id = p_id and status = 'pending';
  if not found then return; end if;
  if p_approve and p.capability = 'approve_access' then
    update public.student_access set status = 'verified', method = 'admin', note = 'Approved by you via Autopilot', admin_seen = true, reviewed_at = now(), reviewed_by = (select auth.uid()) where user_id = (p.payload->>'user_id')::uuid and status = 'pending';
    insert into public.agent_log (capability, summary, detail, undo) values ('approve_access', 'You approved: ' || p.summary, p.payload, jsonb_build_object('type', 'access_back_to_pending', 'user_id', p.payload->>'user_id'));
  end if;
  update public.agent_proposals set status = case when p_approve then 'approved' else 'dismissed' end, decided_at = now() where id = p_id;
end $$;

create or replace function public.admin_agent_undo(p_log_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare l record;
begin
  if not public.has_role((select auth.uid()), 'admin') then raise exception 'Administrator access required'; end if;
  select * into l from public.agent_log where id = p_log_id and undone_at is null and undo is not null;
  if not found then return; end if;
  if l.undo->>'type' = 'access_back_to_pending' then
    update public.student_access set status = 'pending', note = 'Autopilot approval undone by you', reviewed_at = null where user_id = (l.undo->>'user_id')::uuid;
  end if;
  update public.agent_log set undone_at = now() where id = p_log_id;
end $$;

-- is the hourly schedule installed?
create or replace function public.admin_agent_status() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare scheduled boolean := false;
begin
  if not public.has_role((select auth.uid()), 'admin') then raise exception 'Administrator access required'; end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then execute 'select exists (select 1 from cron.job where jobname = ''agent-hourly'')' into scheduled; end if;
  return jsonb_build_object('scheduled', scheduled, 'last_run_at', (select last_run_at from public.agent_state where id = 1));
end $$;

revoke all on function public.admin_agent_run(), public.admin_agent_set_mode(text, text), public.admin_agent_decide(uuid, boolean), public.admin_agent_undo(uuid), public.admin_agent_status() from public, anon;
grant execute on function public.admin_agent_run(), public.admin_agent_set_mode(text, text), public.admin_agent_decide(uuid, boolean), public.admin_agent_undo(uuid), public.admin_agent_status() to authenticated;

do $$
begin
  begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron is not available: Autopilot will run when an admin page is open'; end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'agent-hourly';
    perform cron.schedule('agent-hourly', '7 * * * *', 'select private.agent_core();');
  end if;
end $$;

notify pgrst, 'reload schema';
