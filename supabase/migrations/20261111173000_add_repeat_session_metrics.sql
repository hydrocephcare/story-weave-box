-- Add session-based repeat-visit metrics to the admin visitor dashboard.
-- A session is reconstructed from page-view events using a 30-minute inactivity timeout.
-- This is an estimate (not a stored session cookie), but distinguishes repeat browsing
-- sessions from people who simply open several pages in one sitting.

create or replace function public.admin_site_stats(p_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 400);
  today date := ((now() at time zone 'Africa/Nairobi')::date);
  since date := ((now() at time zone 'Africa/Nairobi')::date) - (least(greatest(coalesce(p_days, 30), 1), 400) - 1);
  visitor_total bigint := 0;
  returning_total bigint := 0;
  session_total bigint := 0;
  repeat_session_visitors bigint := 0;
  result jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'admin only'; end if;

  select count(distinct person)
    into visitor_total
    from public.site_visits_eff
    where day >= since;

  select count(distinct current_visit.person)
    into returning_total
    from public.site_visits_eff current_visit
    where current_visit.day >= since
      and exists (
        select 1
        from public.site_visits_eff previous_visit
        where previous_visit.person = current_visit.person
          and previous_visit.day < current_visit.day
      );

  with sequenced as (
    select v.person, v.at,
      lag(v.at) over (partition by v.person order by v.at) as previous_at
    from public.site_visits_eff v
    where v.at >= (since::timestamp at time zone 'Africa/Nairobi') - interval '30 minutes'
  ),
  session_starts as (
    select person, at,
      case when previous_at is null or at - previous_at > interval '30 minutes' then 1 else 0 end as starts_session
    from sequenced
    where at >= (since::timestamp at time zone 'Africa/Nairobi')
  ),
  per_person as (
    select person, sum(starts_session)::bigint as sessions
    from session_starts
    group by person
  )
  select coalesce(sum(sessions), 0), count(*) filter (where sessions > 1)
    into session_total, repeat_session_visitors
    from per_person;

  select jsonb_build_object(
    'days', d,
    'since', since,
    'online', jsonb_build_object(
      'total', (select count(*) from public.site_presence where last_seen > now() - interval '5 minutes'),
      'members', (select count(*) from public.site_presence where last_seen > now() - interval '5 minutes' and member),
      'paths', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'n', n)), '[]'::jsonb) from (select path, count(*) n from public.site_presence where last_seen > now() - interval '5 minutes' group by path order by n desc limit 6) p)
    ),
    'totals', (select jsonb_build_object(
      'visitors', visitor_total,
      'members', count(distinct person) filter (where person like 'u-%'),
      'views', count(*)
    ) from public.site_visits_eff where day >= since),
    'today', (select jsonb_build_object(
      'visitors', count(distinct person),
      'members', count(distinct person) filter (where person like 'u-%'),
      'views', count(*)
    ) from public.site_visits_eff where day = today),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'visitors', visitors, 'members', members, 'views', views) order by day), '[]'::jsonb)
              from (select day, count(distinct person) visitors, count(distinct person) filter (where person like 'u-%') members, count(*) views from public.site_visits_eff where day >= since group by day) x),
    'top', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'views', views, 'visitors', visitors)), '[]'::jsonb)
            from (select path, count(*) views, count(distinct person) visitors from public.site_visits_eff where day >= since group by path order by views desc limit 10) y),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('device', coalesce(nullif(device, ''), 'unknown'), 'visitors', n)), '[]'::jsonb)
                from (select device, count(distinct person) n from public.site_visits_eff where day >= since group by device order by n desc) z),
    'returning', returning_total,
    'newVisitors', greatest(visitor_total - returning_total, 0),
    'returningRate', case when visitor_total > 0 then round((returning_total::numeric * 100) / visitor_total, 1) else 0 end,
    'sessions', session_total,
    'repeatSessionVisitors', repeat_session_visitors,
    'repeatSessionRate', case when visitor_total > 0 then round((repeat_session_visitors::numeric * 100) / visitor_total, 1) else 0 end,
    'avgPagesPerVisitor', case when visitor_total > 0 then round(((select count(*)::numeric from public.site_visits_eff where day >= since) / visitor_total), 2) else 0 end,
    'accounts', jsonb_build_object(
      'total', (select count(*) from auth.users),
      'active', (select count(*) from auth.users where last_sign_in_at >= (since::timestamp at time zone 'Africa/Nairobi'))
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_site_stats(int) from public;
grant execute on function public.admin_site_stats(int) to authenticated;
