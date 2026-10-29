-- Visitors counted exactly, and signed-in people counted at all.
-- Two faults in the previous counting (20261015150000):
--   1. track_visit failed for EVERY signed-in visit ("column reference machine is ambiguous"), the error was swallowed in the browser, and so no signed-in
--      person was ever recorded: the "signed in" numbers were always zero and online members never appeared.
--   2. guests were merged by network address + phone model + screen + time zone. Many students on one campus Wi-Fi with the same phone model are
--      one "machine", so dozens of different people were counted as one visitor, and a single signed-in student on that Wi-Fi absorbed them all.
-- Now a person is:
--   - signed in: their account (one person across all their phones and browsers);
--   - not signed in: this browser's own random id (two people are never merged); once that browser signs in, its earlier guest visits count as that account.
-- Rows already recorded keep the older machine-based person (the browser id was not stored then, so they cannot be split again); new rows are exact.

create table if not exists public.site_visitor_owner (
  visitor text primary key,
  owner text not null,
  seen timestamptz not null default now()
);
alter table public.site_visitor_owner enable row level security;
revoke all on public.site_visitor_owner from anon, authenticated;

create or replace view public.site_visits_eff as
select v.*, coalesce(vo.owner, mo.owner, v.visitor) as person
from public.site_visits v
left join public.site_visitor_owner vo on vo.visitor = v.visitor
left join public.site_machine_owner mo on v.machine is not null and mo.machine = v.machine;
revoke all on public.site_visits_eff from anon, authenticated;

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
  kind text := left(split_part(coalesce(p_device, ''), '~', 1), 20);   -- phone, tablet or desktop
  who text;                                                              -- the person this visit counts as
begin
  if p_visitor is null or length(p_visitor) < 8 or length(p_visitor) > 64 then return; end if;
  if p_path is null or length(p_path) > 200 or p_path like '/admin%' then return; end if;

  if uid is not null then
    who := 'u-' || substr(md5(uid::text || '|ompath'), 1, 24);
    insert into public.site_visitor_owner as vo (visitor, owner, seen) values (p_visitor, who, now())
      on conflict (visitor) do update set owner = excluded.owner, seen = now();
    -- the browser's earlier "guest" presence row is the same person: do not count them twice while online
    delete from public.site_presence where visitor = p_visitor;
  else
    select vo.owner into who from public.site_visitor_owner vo where vo.visitor = p_visitor;
    who := coalesce(who, p_visitor);
  end if;

  insert into public.site_presence as sp (visitor, member, path, device, last_seen)
  values (who, uid is not null, left(p_path, 200), kind, now())
  on conflict (visitor) do update
    set member = sp.member or excluded.member, path = excluded.path, device = coalesce(nullif(excluded.device, ''), sp.device), last_seen = now();

  if not coalesce(p_beat, false) then
    select count(*) into recent from public.site_visits sv where sv.visitor = who and sv.at > now() - interval '1 hour';
    if recent < 80 then
      insert into public.site_visits (visitor, member, path, device, ref)
      values (who, uid is not null, left(p_path, 200), kind, left(coalesce(p_ref, ''), 80));
    end if;
  end if;
end;
$$;
revoke all on function public.track_visit(text, text, text, text, boolean) from public;
grant execute on function public.track_visit(text, text, text, text, boolean) to anon, authenticated;

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
    -- a signed-in person is one whose id starts with u- (their account), however many devices they used
    'totals', (select jsonb_build_object('visitors', count(distinct person), 'members', count(distinct person) filter (where person like 'u-%'), 'views', count(*)) from public.site_visits_eff where day >= since),
    'today', (select jsonb_build_object('visitors', count(distinct person), 'members', count(distinct person) filter (where person like 'u-%'), 'views', count(*)) from public.site_visits_eff where day = today),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'visitors', visitors, 'members', members, 'views', views) order by day), '[]'::jsonb)
              from (select day, count(distinct person) visitors, count(distinct person) filter (where person like 'u-%') members, count(*) views from public.site_visits_eff where day >= since group by day) x),
    'top', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'views', views, 'visitors', visitors)), '[]'::jsonb)
            from (select path, count(*) views, count(distinct person) visitors from public.site_visits_eff where day >= since group by path order by views desc limit 10) y),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('device', coalesce(nullif(device, ''), 'unknown'), 'visitors', n)), '[]'::jsonb)
                from (select device, count(distinct person) n from public.site_visits_eff where day >= since group by device order by n desc) z),
    'returning', (select count(*) from (select person from public.site_visits_eff where day >= since group by person having count(distinct day) > 1) r),
    -- accounts that have used the site, to read the signed-in number against: all accounts, and how many signed in during this period
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
