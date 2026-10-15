-- The daily Autopilot digest now also lands in each administrator's notification bell (and stays in the Autopilot log). Needs 20261016160000_autopilot.sql. Safe to run twice.

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
    -- the same digest, in each administrator's notification bell, so it is waiting for you when you open the site
    if to_regclass('public.notification_campaigns') is not null and to_regclass('public.user_notifications') is not null then
      declare adm uuid; cid uuid; msg text := 'Last 24 hours: ' || v24 || ' page views from ' || vis24 || ' visitors, ' || newu || ' new accounts. Waiting for you: ' || pend || ' access requests, ' || appeals || ' contest appeals.';
      begin
        select user_id into adm from public.user_roles where role = 'admin' order by id limit 1;
        if adm is not null then
          insert into public.notification_campaigns (title, message, action_url, audience, status, recipient_count, created_by, sent_at)
          values ('Your daily site briefing', msg, 'https://www.ompathstudy.com/admin/autopilot', 'all_users', 'partial', 0, adm, now()) returning id into cid;
          insert into public.user_notifications (campaign_id, user_id, title, message, action_url, email_status)
          select cid, ur.user_id, 'Your daily site briefing', msg, 'https://www.ompathstudy.com/admin/autopilot', 'skipped' from public.user_roles ur where ur.role = 'admin' on conflict do nothing;
          update public.notification_campaigns set recipient_count = (select count(*) from public.user_notifications where campaign_id = cid) where id = cid;
        end if;
      end;
    end if;

  end if;

  update public.agent_state set last_run_at = now() where id = 1;
  return jsonb_build_object('approved', approved, 'queued', queued);
end $$;
