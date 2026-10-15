-- Contest entry rules enforced in the database (no function deploy needed):
--  1. auto_verify (default on): a student who registers is admitted straight away.
--  2. university_ids: if a contest is limited to chosen universities, other universities are refused.
alter table public.contests add column if not exists auto_verify boolean not null default true;
alter table public.contests add column if not exists university_ids uuid[] not null default '{}';

create or replace function private.contest_registration_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  select auto_verify, university_ids into c from public.contests where id = new.contest_id;
  if c is null then return new; end if;
  if tg_op = 'INSERT' and coalesce(array_length(c.university_ids, 1), 0) > 0 and not (new.university_id = any (c.university_ids)) then
    raise exception 'This contest is not open to that university';
  end if;
  if tg_op = 'INSERT' and c.auto_verify and new.status = 'pending' then new.status := 'verified'; end if;
  return new;
end;
$$;
revoke all on function private.contest_registration_guard() from public, anon, authenticated;

drop trigger if exists contest_registration_guard on public.contest_registrations;
create trigger contest_registration_guard before insert on public.contest_registrations
for each row execute function private.contest_registration_guard();

-- the confirmation message says "confirmed" when the student was admitted straight away
create or replace function private.notify_contest_registration()
returns trigger language plpgsql security definer set search_path = '' as $$
declare campaign_id uuid; actor_id uuid; contest_row record; notice_title text; notice_message text;
begin
  select user_id into actor_id from public.user_roles where role='admin' order by id limit 1;
  select title,slug into contest_row from public.contests where id=new.contest_id;
  if actor_id is null or contest_row is null then return new; end if;
  if tg_op='INSERT' and new.status='verified' then
    notice_title := 'You are in: contest entry confirmed'; notice_message := 'Your entry for ' || contest_row.title || ' is confirmed. Open the lobby to see the schedule.';
  elsif tg_op='INSERT' then
    notice_title := 'Contest registration received'; notice_message := 'Your registration for ' || contest_row.title || ' was received and is awaiting verification.';
  elsif old.status is distinct from new.status and new.status='verified' then
    notice_title := 'Contest entry verified'; notice_message := 'Your entry for ' || contest_row.title || ' is verified. Open the lobby to review the schedule.';
  else return new;
  end if;
  insert into public.notification_campaigns(title,message,action_url,audience,status,recipient_count,created_by,sent_at)
  values(notice_title,notice_message,'https://www.ompathstudy.com/contests/' || contest_row.slug || '/lobby','contest','partial',1,actor_id,now()) returning id into campaign_id;
  insert into public.user_notifications(campaign_id,user_id,title,message,action_url,email_status)
  values(campaign_id,new.user_id,notice_title,notice_message,'https://www.ompathstudy.com/contests/' || contest_row.slug || '/lobby','skipped');
  return new;
end;
$$;

-- Admin-only way to save who can enter and whether students are admitted automatically (the browser cannot write to public.contests directly).
create or replace function public.admin_set_contest_rules(p_contest_id uuid, p_university_ids uuid[], p_auto_verify boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role((select auth.uid()), 'admin') then raise exception 'Administrator access required'; end if;
  update public.contests
  set university_ids = coalesce(p_university_ids, '{}'), auto_verify = coalesce(p_auto_verify, auto_verify), updated_at = now()
  where id = p_contest_id;
end;
$$;
revoke all on function public.admin_set_contest_rules(uuid, uuid[], boolean) from public, anon;
grant execute on function public.admin_set_contest_rules(uuid, uuid[], boolean) to authenticated;
