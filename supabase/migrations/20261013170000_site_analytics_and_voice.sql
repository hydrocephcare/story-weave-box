-- Visitor counting for the admin, and a place for the admin's own voice recordings.
-- Run this once in the Supabase SQL editor. Nothing here stores a name, an e-mail address or an IP address: a visitor is a random id kept on their device.

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Page views and who is online. The tables can only be reached through the functions below.
create table if not exists public.site_visits (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  day date not null default ((now() at time zone 'Africa/Nairobi')::date),
  visitor text not null check (length(visitor) between 8 and 64),
  member boolean not null default false,
  path text not null check (length(path) <= 200),
  device text,
  ref text
);
create index if not exists site_visits_day_idx on public.site_visits (day, visitor);
create index if not exists site_visits_at_idx on public.site_visits (at desc);
alter table public.site_visits enable row level security;

create table if not exists public.site_presence (
  visitor text primary key check (length(visitor) between 8 and 64),
  member boolean not null default false,
  path text,
  device text,
  last_seen timestamptz not null default now()
);
create index if not exists site_presence_seen_idx on public.site_presence (last_seen desc);
alter table public.site_presence enable row level security;

create or replace function public.track_visit(
  p_visitor text, p_path text, p_device text default null, p_ref text default null, p_beat boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_member boolean := auth.uid() is not null;
  recent int;
begin
  if p_visitor is null or length(p_visitor) < 8 or length(p_visitor) > 64 then return; end if;
  if p_path is null or length(p_path) > 200 or p_path like '/admin%' then return; end if;

  insert into public.site_presence as sp (visitor, member, path, device, last_seen)
  values (p_visitor, is_member, left(p_path, 200), left(coalesce(p_device, ''), 20), now())
  on conflict (visitor) do update
    set member = excluded.member, path = excluded.path, device = coalesce(nullif(excluded.device, ''), sp.device), last_seen = now();

  if not coalesce(p_beat, false) then
    select count(*) into recent from public.site_visits where visitor = p_visitor and at > now() - interval '1 hour';
    if recent < 80 then
      insert into public.site_visits (visitor, member, path, device, ref)
      values (p_visitor, is_member, left(p_path, 200), left(coalesce(p_device, ''), 20), left(coalesce(p_ref, ''), 80));
    end if;
  end if;
end;
$$;
revoke all on function public.track_visit(text, text, text, text, boolean) from public;
grant execute on function public.track_visit(text, text, text, text, boolean) to anon, authenticated;

-- The numbers the admin sees: online now, totals for the period, one row per day, the busiest pages, the devices.
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
    'totals', (select jsonb_build_object('visitors', count(distinct visitor), 'members', count(distinct visitor) filter (where member), 'views', count(*)) from public.site_visits where day >= since),
    'today', (select jsonb_build_object('visitors', count(distinct visitor), 'members', count(distinct visitor) filter (where member), 'views', count(*)) from public.site_visits where day = ((now() at time zone 'Africa/Nairobi')::date)),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'visitors', visitors, 'members', members, 'views', views) order by day), '[]'::jsonb)
              from (select day, count(distinct visitor) visitors, count(distinct visitor) filter (where member) members, count(*) views from public.site_visits where day >= since group by day) x),
    'top', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'views', views, 'visitors', visitors)), '[]'::jsonb)
            from (select path, count(*) views, count(distinct visitor) visitors from public.site_visits where day >= since group by path order by views desc limit 10) y),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('device', coalesce(nullif(device, ''), 'unknown'), 'visitors', n)), '[]'::jsonb)
                from (select device, count(distinct visitor) n from public.site_visits where day >= since group by device order by n desc) z),
    'returning', (select count(*) from (select visitor from public.site_visits where day >= since group by visitor having count(distinct day) > 1) r)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_site_stats(int) from public;
grant execute on function public.admin_site_stats(int) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The admin's own voice for a page (recorded in the browser, played by the Listen button in place of the computer voice).
insert into storage.buckets (id, name, public) values ('page-audio', 'page-audio', true) on conflict (id) do nothing;
drop policy if exists "page audio is public" on storage.objects;
create policy "page audio is public" on storage.objects for select using (bucket_id = 'page-audio');
drop policy if exists "admin adds page audio" on storage.objects;
create policy "admin adds page audio" on storage.objects for insert to authenticated with check (bucket_id = 'page-audio' and public.has_role(auth.uid(), 'admin'));
drop policy if exists "admin changes page audio" on storage.objects;
create policy "admin changes page audio" on storage.objects for update to authenticated using (bucket_id = 'page-audio' and public.has_role(auth.uid(), 'admin'));
drop policy if exists "admin removes page audio" on storage.objects;
create policy "admin removes page audio" on storage.objects for delete to authenticated using (bucket_id = 'page-audio' and public.has_role(auth.uid(), 'admin'));
