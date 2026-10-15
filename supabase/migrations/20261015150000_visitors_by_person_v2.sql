-- Visitors counted as PEOPLE, better than by network address alone (this replaces the counting part of 20261015140000; run it after that file, or on its own).
-- A website can never see a device's MAC address (only the router in the building can), and many students share one Wi-Fi address, so the address alone
-- would merge different people. A visitor is now worked out in this order:
--   1. someone signed in: their account, on any phone, laptop or browser = one person;
--   2. someone not signed in: network address + the kind of computer (system, screen size, time zone, language) = one machine, whatever browser they use,
--      so two students on the same Wi-Fi with different devices stay separate;
--   3. if neither is available: the browser's own random id.
-- When a signed-in person is seen on a machine, that machine's other browsers are counted as that same person. No address is stored, only a one-way code
-- that changes every week.

alter table public.site_visits add column if not exists machine text;
create index if not exists site_visits_machine_idx on public.site_visits (machine) where machine is not null;

-- which signed-in person a machine belongs to (the latest one seen on it)
create table if not exists public.site_machine_owner (
  machine text primary key,
  owner text not null,
  seen timestamptz not null default now()
);
alter table public.site_machine_owner enable row level security;

-- every visit with the person it counts as
create or replace view public.site_visits_eff as
select v.*, coalesce(o.owner, v.visitor) as person
from public.site_visits v
left join public.site_machine_owner o on o.machine = v.machine;

create or replace function public.track_visit(
  p_visitor text, p_path text, p_device text default null, p_ref text default null, p_beat boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  recent int;
  hdr json;
  ip text;
  kind text := left(split_part(coalesce(p_device, ''), '~', 1), 20);   -- phone, tablet or desktop
  hint text := left(split_part(coalesce(p_device, ''), '~', 2), 80);   -- system, screen, time zone, language
  week text := to_char(now() at time zone 'Africa/Nairobi', 'IYYY-IW');
  machine text;
  person text;
begin
  if p_visitor is null or length(p_visitor) < 8 or length(p_visitor) > 64 then return; end if;
  if p_path is null or length(p_path) > 200 or p_path like '/admin%' then return; end if;

  begin
    hdr := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    hdr := null;
  end;
  ip := nullif(btrim(coalesce(hdr ->> 'cf-connecting-ip', split_part(coalesce(hdr ->> 'x-forwarded-for', ''), ',', 1), hdr ->> 'x-real-ip', '')), '');
  if ip is not null and hint <> '' then
    machine := 'm-' || substr(md5(ip || '|' || hint || '|' || week || '|ompath'), 1, 24);
  end if;

  if uid is not null then
    person := 'u-' || substr(md5(uid::text || '|ompath'), 1, 24);
    if machine is not null then
      insert into public.site_machine_owner as o (machine, owner, seen) values (machine, person, now())
      on conflict (machine) do update set owner = excluded.owner, seen = now();
    end if;
  elsif machine is not null then
    person := machine;
  else
    person := p_visitor;
  end if;

  insert into public.site_presence as sp (visitor, member, path, device, last_seen)
  values (person, uid is not null, left(p_path, 200), kind, now())
  on conflict (visitor) do update
    set member = sp.member or excluded.member, path = excluded.path, device = coalesce(nullif(excluded.device, ''), sp.device), last_seen = now();

  if not coalesce(p_beat, false) then
    select count(*) into recent from public.site_visits where visitor = person and at > now() - interval '1 hour';
    if recent < 80 then
      insert into public.site_visits (visitor, member, path, device, ref, machine)
      values (person, uid is not null, left(p_path, 200), kind, left(coalesce(p_ref, ''), 80), machine);
    end if;
  end if;
end;
$$;
revoke all on function public.track_visit(text, text, text, text, boolean) from public;
grant execute on function public.track_visit(text, text, text, text, boolean) to anon, authenticated;

-- the admin's numbers, counting people (a machine that later turns out to be a signed-in student's counts as that student)
create or replace function public.admin_site_stats(p_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 400);
  since date := ((now() at time zone 'Africa/Nairobi')::date) - (least(greatest(coalesce(p_days, 30), 1), 400) - 1);
  result jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'admin only'; end if;
  select jsonb_build_object(
    'days', d,
    'since', since,
    'online', jsonb_build_object(
      'total', (select count(*) from public.site_presence where last_seen > now() - interval '5 minutes'),
      'members', (select count(*) from public.site_presence where last_seen > now() - interval '5 minutes' and member),
      'paths', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'n', n)), '[]'::jsonb) from (select path, count(*) n from public.site_presence where last_seen > now() - interval '5 minutes' group by path order by n desc limit 6) p)
    ),
    'totals', (select jsonb_build_object('visitors', count(distinct person), 'members', count(distinct person) filter (where member), 'views', count(*)) from public.site_visits_eff where day >= since),
    'today', (select jsonb_build_object('visitors', count(distinct person), 'members', count(distinct person) filter (where member), 'views', count(*)) from public.site_visits_eff where day = ((now() at time zone 'Africa/Nairobi')::date)),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'visitors', visitors, 'members', members, 'views', views) order by day), '[]'::jsonb)
              from (select day, count(distinct person) visitors, count(distinct person) filter (where member) members, count(*) views from public.site_visits_eff where day >= since group by day) x),
    'top', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'views', views, 'visitors', visitors)), '[]'::jsonb)
            from (select path, count(*) views, count(distinct person) visitors from public.site_visits_eff where day >= since group by path order by views desc limit 10) y),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('device', coalesce(nullif(device, ''), 'unknown'), 'visitors', n)), '[]'::jsonb)
                from (select device, count(distinct person) n from public.site_visits_eff where day >= since group by device order by n desc) z),
    'returning', (select count(*) from (select person from public.site_visits_eff where day >= since group by person having count(distinct day) > 1) r)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_site_stats(int) from public;
grant execute on function public.admin_site_stats(int) to authenticated;

-- the view is for the functions only: nobody reads visit rows directly
revoke all on public.site_visits_eff from anon, authenticated;
revoke all on public.site_machine_owner from anon, authenticated;
