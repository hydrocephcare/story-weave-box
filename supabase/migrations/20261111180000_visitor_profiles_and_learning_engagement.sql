-- Consolidated source migration for the visitor analytics upgrade.

-- The same DDL/functions were applied to the production Supabase project through migrations.

alter table public.site_visitor_owner add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.site_visits add column if not exists is_admin boolean not null default false;

alter table public.site_presence add column if not exists is_admin boolean not null default false;

create table if not exists public.site_analytics_events (id bigint generated always as identity primary key, at timestamptz not null default now(), person text not null, visitor text not null, user_id uuid references auth.users(id) on delete set null, is_admin boolean not null default false, event_name text not null check(length(event_name) between 2 and 40), path text not null check(length(path)<=200), properties jsonb not null default '{}'::jsonb);

create index if not exists site_analytics_events_person_at_idx on public.site_analytics_events(person,at desc);

create index if not exists site_analytics_events_name_at_idx on public.site_analytics_events(event_name,at desc);

alter table public.site_analytics_events enable row level security;

revoke all on public.site_analytics_events from anon, authenticated;

create or replace view public.site_visits_eff as select v.id,v.at,v.day,v.visitor,v.member,v.path,v.device,v.ref,v.machine,coalesce(vo.owner,mo.owner,v.visitor) as person,v.is_admin from public.site_visits v left join public.site_visitor_owner vo on vo.visitor=v.visitor left join public.site_machine_owner mo on v.machine is not null and mo.machine=v.machine;

revoke all on public.site_visits_eff from anon, authenticated;

with admins as (select id,'u-'||substr(md5(id::text||'|ompath'),1,24) person from auth.users where public.has_role(id,'admin')) update public.site_visitor_owner vo set user_id=a.id from admins a where vo.owner=a.person and vo.user_id is distinct from a.id;

with admins as (select 'u-'||substr(md5(id::text||'|ompath'),1,24) person from auth.users where public.has_role(id,'admin')) update public.site_visits v set is_admin=true where not v.is_admin and (v.visitor in (select person from admins) or exists(select 1 from public.site_visitor_owner vo where vo.visitor=v.visitor and vo.owner in (select person from admins)) or exists(select 1 from public.site_machine_owner mo where mo.machine=v.machine and mo.owner in (select person from admins)));

with admins as (select 'u-'||substr(md5(id::text||'|ompath'),1,24) person from auth.users where public.has_role(id,'admin')) update public.site_presence sp set is_admin=true where sp.visitor in (select person from admins);

CREATE OR REPLACE FUNCTION public.track_visit(p_visitor text, p_path text, p_device text DEFAULT NULL::text, p_ref text DEFAULT NULL::text, p_beat boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := (select auth.uid());
  is_admin_user boolean := coalesce(public.has_role((select auth.uid()),'admin'),false);
  recent int;
  kind text := left(split_part(coalesce(p_device,''),'~',1),20);
  who text;
  activity text;
begin
  if p_visitor is null or length(p_visitor)<8 or length(p_visitor)>64 then return; end if;
  if p_path is null or length(p_path)>200 then return; end if;
  if p_path like '/admin%' and not is_admin_user then return; end if;
  if uid is not null then
    who := 'u-' || substr(md5(uid::text || '|ompath'),1,24);
    insert into public.site_visitor_owner as vo(visitor,owner,seen,user_id)
    values(p_visitor,who,now(),uid)
    on conflict(visitor) do update set owner=excluded.owner,seen=now(),user_id=excluded.user_id;
    delete from public.site_presence where visitor=p_visitor;
  else
    select vo.owner into who from public.site_visitor_owner vo where vo.visitor=p_visitor;
    who := coalesce(who,p_visitor);
  end if;
  insert into public.site_presence as sp(visitor,member,path,device,last_seen,is_admin)
  values(who,uid is not null,left(p_path,200),kind,now(),is_admin_user)
  on conflict(visitor) do update set
    member=sp.member or excluded.member,path=excluded.path,
    device=coalesce(nullif(excluded.device,''),sp.device),last_seen=now(),
    is_admin=sp.is_admin or excluded.is_admin;
  if not coalesce(p_beat,false) then
    select count(*) into recent from public.site_visits sv where sv.visitor=who and sv.at>now()-interval '1 hour';
    if recent<80 then
      insert into public.site_visits(visitor,member,path,device,ref,is_admin)
      values(who,uid is not null,left(p_path,200),kind,left(coalesce(p_ref,''),80),is_admin_user);
      activity := case
        when p_path like '/exams/%/start%' then 'exam_start'
        when p_path like '/year/%' or p_path like '/library/%' or p_path like '/course-outlines%' or p_path like '/dental%' then 'course_open'
        when p_path like '/blog/%' or p_path like '/topic/%' or p_path like '/flashcards/%' or p_path like '/mcqs/%' or p_path like '/papers/%' or p_path like '/books/%' then 'resource_open'
        else 'page_view' end;
      insert into public.site_analytics_events(person,visitor,user_id,is_admin,event_name,path,properties)
      values(who,who,uid,is_admin_user,activity,left(p_path,200),jsonb_build_object('device',kind,'referrer',left(coalesce(p_ref,''),80)));
    end if;
  end if;
end;
$function$


CREATE OR REPLACE FUNCTION public.track_site_event(p_visitor text, p_event_name text, p_path text, p_properties jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := (select auth.uid());
  who text;
  safe_props jsonb := '{}'::jsonb;
  allowed boolean;
  is_admin_user boolean := coalesce(public.has_role((select auth.uid()), 'admin'), false);
begin
  if p_visitor is null or length(p_visitor) < 8 or length(p_visitor) > 64 then return; end if;
  if p_path is null or length(p_path) > 200 or p_path like '/admin%' then return; end if;
  if p_event_name not in ('search', 'course_open', 'resource_open', 'mcq_answer', 'flashcard_review', 'exam_start', 'exam_complete') then return; end if;

  if uid is not null then
    who := 'u-' || substr(md5(uid::text || '|ompath'), 1, 24);
    insert into public.site_visitor_owner as vo (visitor, owner, seen, user_id)
    values (p_visitor, who, now(), uid)
    on conflict (visitor) do update set owner = excluded.owner, seen = now(), user_id = excluded.user_id;
  else
    select vo.owner into who from public.site_visitor_owner vo where vo.visitor = p_visitor;
    who := coalesce(who, p_visitor);
  end if;

  -- Only accept a small, explicit set of non-sensitive properties.
  if jsonb_typeof(coalesce(p_properties, '{}'::jsonb)) = 'object' then
    safe_props := jsonb_strip_nulls(jsonb_build_object(
      'term', left(coalesce(p_properties->>'term', ''), 100),
      'course', left(coalesce(p_properties->>'course', ''), 40),
      'resource_type', left(coalesce(p_properties->>'resource_type', ''), 40),
      'result', left(coalesce(p_properties->>'result', ''), 30),
      'correct', case when p_properties ? 'correct' and (p_properties->>'correct') in ('true','false') then (p_properties->>'correct')::boolean else null end
    ));
  end if;

  insert into public.site_analytics_events (person, visitor, user_id, is_admin, event_name, path, properties)
  values (who, p_visitor, uid, is_admin_user, p_event_name, left(p_path, 200), safe_props);
end;
$function$


CREATE OR REPLACE FUNCTION public.admin_visitor_list(p_days integer DEFAULT 30, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_include_admins boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  since_at timestamptz := ((now() at time zone 'Africa/Nairobi')::date - (least(greatest(coalesce(p_days,30),1),400)-1))::timestamp at time zone 'Africa/Nairobi';
  result jsonb;
begin
  if not public.has_role((select auth.uid()), 'admin') then raise exception 'admin only'; end if;
  with people as (
    select v.person, count(*)::bigint views,
      count(distinct date(v.at at time zone 'Africa/Nairobi'))::bigint active_days,
      min(v.at) first_seen, max(v.at) last_seen,
      (array_agg(v.path order by v.at desc))[1] last_path,
      (array_agg(v.device order by v.at desc))[1] device,
      (array_agg(v.ref order by v.at asc) filter (where coalesce(v.ref,'') <> ''))[1] first_referrer,
      bool_or(v.is_admin) is_admin, bool_or(v.person like 'u-%') is_member
    from public.site_visits_eff v
    where v.at >= since_at and (p_include_admins or not v.is_admin)
    group by v.person
  ), page as (
    select p.*, vo.user_id
    from (select * from people order by last_seen desc limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0)) p
    left join lateral (select x.user_id from public.site_visitor_owner x where x.owner=p.person and x.user_id is not null order by x.seen desc limit 1) vo on true
  )
  select jsonb_build_object(
    'total',(select count(*) from people),
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'person',p.person,'visitor_id',case when p.person like 'u-%' then 'account-'||right(p.person,8) else 'guest-'||right(p.person,8) end,
      'email',u.email,'display_name',coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name'),
      'signed_in',p.is_member,'is_admin',p.is_admin,'views',p.views,'active_days',p.active_days,
      'first_seen',p.first_seen,'last_seen',p.last_seen,'last_path',p.last_path,'device',p.device,'referrer',p.first_referrer
    ) order by p.last_seen desc) from page p left join auth.users u on u.id=p.user_id),'[]'::jsonb)
  ) into result;
  return result;
end;
$function$


CREATE OR REPLACE FUNCTION public.admin_visitor_detail(p_person text, p_days integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  since_at timestamptz := ((now() at time zone 'Africa/Nairobi')::date-(least(greatest(coalesce(p_days,90),1),400)-1))::timestamp at time zone 'Africa/Nairobi';
  result jsonb;
begin
  if not public.has_role((select auth.uid()),'admin') then raise exception 'admin only'; end if;
  if p_person is null or length(p_person)>64 then raise exception 'invalid visitor'; end if;
  select jsonb_build_object(
    'profile',jsonb_build_object('person',p.person,'visitor_id',case when p.person like 'u-%' then 'account-'||right(p.person,8) else 'guest-'||right(p.person,8) end,
      'email',u.email,'display_name',coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name'),
      'signed_in',p.person like 'u-%','is_admin',coalesce(p.is_admin,false),'views',p.views,'active_days',p.active_days,
      'first_seen',p.first_seen,'last_seen',p.last_seen,'device',p.device),
    'journey',coalesce((select jsonb_agg(jsonb_build_object('at',j.at,'path',j.path,'device',j.device,'referrer',j.referrer) order by j.at desc)
      from (select v.at,v.path,v.device,v.ref as referrer from public.site_visits_eff v where v.person=p.person and v.at>=since_at order by v.at desc limit 200) j),'[]'::jsonb),
    'sessions',coalesce((with sequenced as (
      select v.at,v.path,lag(v.at) over(order by v.at) prev_at from public.site_visits_eff v
      where v.person=p.person and v.at>=since_at-interval '30 minutes'
    ), marked as (
      select at,path,case when prev_at is null or at-prev_at>interval '30 minutes' then 1 else 0 end starts
      from sequenced where at>=since_at
    ), numbered as (
      select at,path,sum(starts) over(order by at) session_no from marked
    ), groups as (
      select session_no,min(at) started,max(at) ended,count(*)::int views from numbered group by session_no
    )
    select jsonb_agg(jsonb_build_object('started',started,'ended',ended,'views',views) order by started desc) from (select * from groups order by started desc limit 100) s),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('at',e.at,'event',e.event_name,'path',e.path,'properties',e.properties) order by e.at desc)
      from (select * from public.site_analytics_events e where e.person=p.person and e.at>=since_at order by e.at desc limit 150) e),'[]'::jsonb)
  ) into result
  from (
    select v.person,count(*)::bigint views,count(distinct date(v.at at time zone 'Africa/Nairobi'))::bigint active_days,
      min(v.at) first_seen,max(v.at) last_seen,(array_agg(v.device order by v.at desc))[1] device,bool_or(v.is_admin) is_admin
    from public.site_visits_eff v where v.person=p_person and v.at>=since_at group by v.person
  ) p
  left join lateral (select x.user_id from public.site_visitor_owner x where x.owner=p.person and x.user_id is not null order by x.seen desc limit 1) vo on true
  left join auth.users u on u.id=vo.user_id;
  return coalesce(result,'{}'::jsonb);
end;
$function$


CREATE OR REPLACE FUNCTION public.my_site_activity(p_days integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := (select auth.uid());
  who text;
  since_at timestamptz := ((now() at time zone 'Africa/Nairobi')::date-(least(greatest(coalesce(p_days,90),1),400)-1))::timestamp at time zone 'Africa/Nairobi';
  result jsonb;
begin
  if uid is null then raise exception 'sign in required'; end if;
  who := 'u-' || substr(md5(uid::text || '|ompath'),1,24);
  select jsonb_build_object(
    'profile',jsonb_build_object('signed_in',true,'is_admin',public.has_role(uid,'admin'),'views',count(*),
      'first_seen',min(v.at),'last_seen',max(v.at),'active_days',count(distinct date(v.at at time zone 'Africa/Nairobi'))),
    'journey',coalesce((select jsonb_agg(jsonb_build_object('at',j.at,'path',j.path,'device',j.device,'referrer',j.ref) order by j.at desc)
      from (select x.at,x.path,x.device,x.ref from public.site_visits_eff x where x.person=who and x.at>=since_at order by x.at desc limit 250) j),'[]'::jsonb),
    'sessions',coalesce((with sequenced as (
      select v.at,v.path,lag(v.at) over(order by v.at) prev_at from public.site_visits_eff v
      where v.person=who and v.at>=since_at-interval '30 minutes'
    ), marked as (
      select at,path,case when prev_at is null or at-prev_at>interval '30 minutes' then 1 else 0 end starts
      from sequenced where at>=since_at
    ), numbered as (
      select at,path,sum(starts) over(order by at) session_no from marked
    ), groups as (select session_no,min(at) started,max(at) ended,count(*)::int views from numbered group by session_no)
    select jsonb_agg(jsonb_build_object('started',started,'ended',ended,'views',views) order by started desc) from (select * from groups order by started desc limit 100) s),'[]'::jsonb)
  ) into result from public.site_visits_eff v where v.person=who and v.at>=since_at;
  return coalesce(result,jsonb_build_object('profile',jsonb_build_object('signed_in',true,'views',0,'active_days',0),'journey','[]'::jsonb,'sessions','[]'::jsonb));
end;
$function$


CREATE OR REPLACE FUNCTION public.admin_site_stats(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  d int := least(greatest(coalesce(p_days,30),1),400);
  today date := ((now() at time zone 'Africa/Nairobi')::date);
  since date := today - (least(greatest(coalesce(p_days,30),1),400) - 1);
  visitor_total bigint := 0;
  returning_total bigint := 0;
  session_total bigint := 0;
  repeat_session_visitors bigint := 0;
  result jsonb;
begin
  if not public.has_role((select auth.uid()), 'admin') then raise exception 'admin only'; end if;
  select count(distinct person) into visitor_total
    from public.site_visits_eff where day >= since and not is_admin;
  select count(distinct c.person) into returning_total
    from public.site_visits_eff c
    where c.day >= since and not c.is_admin and exists (
      select 1 from public.site_visits_eff p
      where p.person = c.person and p.day < c.day
    );
  with sequenced as (
    select v.person,v.at,lag(v.at) over(partition by v.person order by v.at) previous_at
    from public.site_visits_eff v
    where v.at >= (since::timestamp at time zone 'Africa/Nairobi') - interval '30 minutes' and not v.is_admin
  ), starts as (
    select person,at,case when previous_at is null or at-previous_at > interval '30 minutes' then 1 else 0 end start_flag
    from sequenced where at >= (since::timestamp at time zone 'Africa/Nairobi')
  ), per_person as (
    select person,sum(start_flag)::bigint sessions from starts group by person
  )
  select coalesce(sum(sessions),0),count(*) filter(where sessions>1)
    into session_total,repeat_session_visitors from per_person;

  select jsonb_build_object(
    'days',d,'since',since,
    'online',jsonb_build_object(
      'total',(select count(*) from public.site_presence where last_seen>now()-interval '5 minutes' and not is_admin),
      'members',(select count(*) from public.site_presence where last_seen>now()-interval '5 minutes' and member and not is_admin),
      'paths',(select coalesce(jsonb_agg(jsonb_build_object('path',path,'n',n)),'[]'::jsonb) from
        (select path,count(*) n from public.site_presence where last_seen>now()-interval '5 minutes' and not is_admin group by path order by n desc limit 6) x)),
    'totals',(select jsonb_build_object('visitors',count(distinct person),'members',count(distinct person) filter(where person like 'u-%'),'views',count(*))
      from public.site_visits_eff where day>=since and not is_admin),
    'today',(select jsonb_build_object('visitors',count(distinct person),'members',count(distinct person) filter(where person like 'u-%'),'views',count(*))
      from public.site_visits_eff where day=today and not is_admin),
    'daily',(select coalesce(jsonb_agg(jsonb_build_object('day',day,'visitors',visitors,'members',members,'views',views) order by day),'[]'::jsonb)
      from (select day,count(distinct person) visitors,count(distinct person) filter(where person like 'u-%') members,count(*) views
        from public.site_visits_eff where day>=since and not is_admin group by day) x),
    'top',(select coalesce(jsonb_agg(jsonb_build_object('path',path,'views',views,'visitors',visitors)),'[]'::jsonb)
      from (select path,count(*) views,count(distinct person) visitors from public.site_visits_eff where day>=since and not is_admin group by path order by views desc limit 10) x),
    'devices',(select coalesce(jsonb_agg(jsonb_build_object('device',coalesce(nullif(device,''),'unknown'),'visitors',n)),'[]'::jsonb)
      from (select device,count(distinct person) n from public.site_visits_eff where day>=since and not is_admin group by device order by n desc) x),
    'returning',returning_total,'newVisitors',greatest(visitor_total-returning_total,0),
    'returningRate',case when visitor_total>0 then round(returning_total::numeric*100/visitor_total,1) else 0 end,
    'sessions',session_total,'repeatSessionVisitors',repeat_session_visitors,
    'repeatSessionRate',case when visitor_total>0 then round(repeat_session_visitors::numeric*100/visitor_total,1) else 0 end,
    'avgPagesPerVisitor',case when visitor_total>0 then round((select count(*)::numeric from public.site_visits_eff where day>=since and not is_admin)/visitor_total,2) else 0 end,
    'accounts',jsonb_build_object('total',(select count(*) from auth.users),
      'active',(select count(*) from auth.users where last_sign_in_at >= (since::timestamp at time zone 'Africa/Nairobi')))
  ) into result;
  return result;
end;
$function$


CREATE OR REPLACE FUNCTION public.admin_site_engagement(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  since_at timestamptz := ((now() at time zone 'Africa/Nairobi')::date - (least(greatest(coalesce(p_days,30),1),400)-1))::timestamp at time zone 'Africa/Nairobi';
  result jsonb;
begin
  if not public.has_role((select auth.uid()),'admin') then raise exception 'admin only'; end if;
  select jsonb_build_object(
    'since',since_at,
    'counts',jsonb_build_object(
      'searches',count(*) filter(where event_name='search'),
      'courseOpens',count(*) filter(where event_name='course_open'),
      'resourceOpens',count(*) filter(where event_name='resource_open'),
      'mcqAnswers',count(*) filter(where event_name='mcq_answer'),
      'flashcardReviews',count(*) filter(where event_name='flashcard_review'),
      'examStarts',count(*) filter(where event_name='exam_start'),
      'examCompletes',count(*) filter(where event_name='exam_complete')
    ),
    'topSearches',coalesce((select jsonb_agg(jsonb_build_object('term',term,'searches',n) order by n desc)
      from (select left(properties->>'term',100) term,count(*) n from public.site_analytics_events
        where at>=since_at and not is_admin and event_name='search' and coalesce(properties->>'term','')<>''
        group by left(properties->>'term',100) order by n desc limit 10) s),'[]'::jsonb),
    'topResources',coalesce((select jsonb_agg(jsonb_build_object('path',path,'opens',n) order by n desc)
      from (select path,count(*) n from public.site_analytics_events
        where at>=since_at and not is_admin and event_name='resource_open'
        group by path order by n desc limit 10) r),'[]'::jsonb)
  ) into result
  from public.site_analytics_events where at>=since_at and not is_admin;
  return result;
end;
$function$


revoke all on function public.track_visit(text,text,text,text,boolean) from public;

grant execute on function public.track_visit(text,text,text,text,boolean) to anon, authenticated;

revoke all on function public.track_site_event(text,text,text,jsonb) from public;

grant execute on function public.track_site_event(text,text,text,jsonb) to anon, authenticated;

revoke all on function public.admin_visitor_list(integer,integer,integer,boolean) from public, anon;

grant execute on function public.admin_visitor_list(integer,integer,integer,boolean) to authenticated;

revoke all on function public.admin_visitor_detail(text,integer) from public, anon;

grant execute on function public.admin_visitor_detail(text,integer) to authenticated;

revoke all on function public.my_site_activity(integer) from public, anon;

grant execute on function public.my_site_activity(integer) to authenticated;

revoke all on function public.admin_site_stats(integer) from public, anon;

grant execute on function public.admin_site_stats(integer) to authenticated;

revoke all on function public.admin_site_engagement(integer) from public, anon;

grant execute on function public.admin_site_engagement(integer) to authenticated;