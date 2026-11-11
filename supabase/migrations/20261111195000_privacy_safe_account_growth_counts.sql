CREATE OR REPLACE FUNCTION public.admin_site_stats(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  d int:=least(greatest(coalesce(p_days,30),1),400);
  today_local date:=(now() at time zone 'Africa/Nairobi')::date;
  since_day date:=today_local-(least(greatest(coalesce(p_days,30),1),400)-1);
  visitor_total bigint:=0; returning_total bigint:=0; session_total bigint:=0; repeat_session_visitors bigint:=0;
  result jsonb;
begin
  if not public.has_role((select auth.uid()),'admin') then raise exception 'admin only'; end if;
  select count(distinct person) into visitor_total from public.site_visits_eff where day>=since_day and not is_admin;
  select count(distinct c.person) into returning_total from public.site_visits_eff c where c.day>=since_day and not c.is_admin
    and exists(select 1 from public.site_visits_eff p where p.person=c.person and p.day<c.day and not p.is_admin);
  with sequenced as (
    select v.person,v.at,lag(v.at) over(partition by v.person order by v.at) prev
    from public.site_visits_eff v where v.at >= (since_day::timestamp at time zone 'Africa/Nairobi')-interval '30 minutes' and not v.is_admin
  ), starts as (
    select person,at,case when prev is null or at-prev>interval '30 minutes' then 1 else 0 end flag
    from sequenced where at >= (since_day::timestamp at time zone 'Africa/Nairobi')
  ), per_person as (select person,sum(flag)::bigint sessions from starts group by person)
  select coalesce(sum(sessions),0),count(*) filter(where sessions>1) into session_total,repeat_session_visitors from per_person;
  select jsonb_build_object(
    'days',d,'since',since_day,
    'online',jsonb_build_object('total',(select count(*) from public.site_presence where last_seen>now()-interval '5 minutes' and not is_admin),
      'members',(select count(*) from public.site_presence where last_seen>now()-interval '5 minutes' and member and not is_admin),'paths','[]'::jsonb),
    'totals',(select jsonb_build_object('visitors',count(distinct person),'members',count(distinct person) filter(where person like 'u-%'),'views',count(*)) from public.site_visits_eff where day>=since_day and not is_admin),
    'today',(select jsonb_build_object('visitors',count(distinct person),'members',count(distinct person) filter(where person like 'u-%'),'views',count(*)) from public.site_visits_eff where day=today_local and not is_admin),
    'daily',(select coalesce(jsonb_agg(jsonb_build_object('day',day,'visitors',visitors,'members',members,'views',views) order by day),'[]'::jsonb)
      from (select day,count(distinct person) visitors,count(distinct person) filter(where person like 'u-%') members,count(*) views from public.site_visits_eff where day>=since_day and not is_admin group by day) x),
    'top','[]'::jsonb,
    'devices',(select coalesce(jsonb_agg(jsonb_build_object('device',device,'visitors',views)),'[]'::jsonb)
      from (select device,sum(views)::bigint views from public.site_device_daily where day>=since_day group by device order by views desc) x),
    'returning',returning_total,'newVisitors',greatest(visitor_total-returning_total,0),
    'returningRate',case when visitor_total>0 then round(returning_total::numeric*100/visitor_total,1) else 0 end,
    'sessions',session_total,'repeatSessionVisitors',repeat_session_visitors,
    'repeatSessionRate',case when visitor_total>0 then round(repeat_session_visitors::numeric*100/visitor_total,1) else 0 end,
    'avgPagesPerVisitor',case when visitor_total>0 then round((select count(*)::numeric from public.site_visits_eff where day>=since_day and not is_admin)/visitor_total,2) else 0 end,
    'accounts',jsonb_build_object('total',(select count(*) from auth.users),
      'new',(select count(*) from auth.users where created_at >= (since_day::timestamp at time zone 'Africa/Nairobi')),
      'active',(select count(distinct person) from public.site_visits_eff where day>=since_day and not is_admin and person like 'u-%'))
  ) into result;
  return result;
end;
$function$
;