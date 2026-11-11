-- Strict privacy mode: store only aggregate event counts, never page paths or search terms.
create table public.site_analytics_daily_counts (
  day date not null,
  event_name text not null,
  events bigint not null default 0,
  primary key(day,event_name)
);
insert into public.site_analytics_daily_counts(day,event_name,events)
select day,event_name,sum(events) from public.site_analytics_daily group by day,event_name;
drop table public.site_analytics_daily;
alter table public.site_analytics_daily_counts rename to site_analytics_daily;
alter table public.site_analytics_daily enable row level security;
revoke all on public.site_analytics_daily from public,anon,authenticated;
drop table if exists public.site_page_daily;

-- Delete historical individual search text and disable direct client access to the legacy log.
delete from public.search_queries;
alter table public.search_queries enable row level security;
revoke all on public.search_queries from public,anon,authenticated;

create or replace function public.track_visit(p_visitor text,p_path text,p_device text default null,p_ref text default null,p_beat boolean default false)
returns void language plpgsql security definer set search_path=''
as $function$
declare
  uid uuid := (select auth.uid());
  admin_user boolean := coalesce(public.has_role((select auth.uid()),'admin'),false);
  who text;
  recent int;
  kind text := left(split_part(coalesce(p_device,''),'~',1),20);
  today_local date := (now() at time zone 'Africa/Nairobi')::date;
begin
  if p_visitor is null or length(p_visitor)<8 or length(p_visitor)>64 then return; end if;
  if uid is not null then who:='u-'||substr(md5(uid::text||'|ompath'),1,24); else who:=p_visitor; end if;
  insert into public.site_presence(visitor,member,path,device,last_seen,is_admin)
  values(who,uid is not null,'/','',now(),admin_user)
  on conflict(visitor) do update set member=excluded.member,path='/',device='',last_seen=now(),is_admin=excluded.is_admin;
  if coalesce(p_beat,false) then return; end if;
  select count(*) into recent from public.site_visits sv where sv.visitor=who and sv.at>now()-interval '1 hour';
  if recent>=80 then return; end if;
  insert into public.site_visits(visitor,member,path,device,ref,machine,is_admin)
  values(who,uid is not null,'/','','',null,admin_user);
  if not admin_user then
    insert into public.site_device_daily(day,device,views) values(today_local,coalesce(nullif(kind,''),'unknown'),1)
    on conflict(day,device) do update set views=public.site_device_daily.views+1;
  end if;
end;
$function$;
revoke all on function public.track_visit(text,text,text,text,boolean) from public;
grant execute on function public.track_visit(text,text,text,text,boolean) to anon,authenticated;

create or replace function public.track_site_event(p_visitor text,p_event_name text,p_path text,p_properties jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=''
as $function$
declare
  admin_user boolean := coalesce(public.has_role((select auth.uid()),'admin'),false);
  today_local date := (now() at time zone 'Africa/Nairobi')::date;
begin
  if admin_user then return; end if;
  if p_event_name not in ('search','course_open','resource_open','mcq_answer','flashcard_review','exam_start','exam_complete') then return; end if;
  insert into public.site_analytics_daily(day,event_name,events) values(today_local,p_event_name,1)
  on conflict(day,event_name) do update set events=public.site_analytics_daily.events+1;
end;
$function$;
revoke all on function public.track_site_event(text,text,text,jsonb) from public;
grant execute on function public.track_site_event(text,text,text,jsonb) to anon,authenticated;

create or replace function public.admin_site_engagement(p_days int default 30)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  since_day date := (now() at time zone 'Africa/Nairobi')::date-(least(greatest(coalesce(p_days,30),1),400)-1);
  result jsonb;
begin
  if not public.has_role((select auth.uid()),'admin') then raise exception 'admin only'; end if;
  select jsonb_build_object('since',since_day,'counts',jsonb_build_object(
    'searches',coalesce(sum(events) filter(where event_name='search'),0),
    'courseOpens',coalesce(sum(events) filter(where event_name='course_open'),0),
    'resourceOpens',coalesce(sum(events) filter(where event_name='resource_open'),0),
    'mcqAnswers',coalesce(sum(events) filter(where event_name='mcq_answer'),0),
    'flashcardReviews',coalesce(sum(events) filter(where event_name='flashcard_review'),0),
    'examStarts',coalesce(sum(events) filter(where event_name='exam_start'),0),
    'examCompletes',coalesce(sum(events) filter(where event_name='exam_complete'),0)))
  ) into result from public.site_analytics_daily where day>=since_day;
  return result;
end;
$function$;
revoke all on function public.admin_site_engagement(int) from public,anon;
grant execute on function public.admin_site_engagement(int) to authenticated;

create or replace function public.admin_site_stats(p_days integer default 30)
returns jsonb language plpgsql security definer set search_path=''
as $function$
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
      'active',(select count(distinct person) from public.site_visits_eff where day>=since_day and not is_admin and person like 'u-%'))
  ) into result;
  return result;
end;
$function$;
revoke all on function public.admin_site_stats(int) from public,anon;
grant execute on function public.admin_site_stats(int) to authenticated;
