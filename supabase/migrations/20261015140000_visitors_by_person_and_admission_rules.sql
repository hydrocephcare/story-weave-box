-- 1. Visitors are counted as PEOPLE, not browsers.
-- Until now a visitor was a random id kept in one browser, so one laptop with Chrome and Edge counted twice. The count is now keyed on the network address
-- the visit came from, turned into a one-way code that changes every week (the address itself is never stored). The same laptop in any browser is one visitor.
-- Shared networks (a campus, a phone company) can make several people look like one, so treat the number as "about this many people".
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
  hdr json;
  ip text;
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
  if ip is not null then
    person := 'p-' || substr(md5(ip || ':' || to_char(now() at time zone 'Africa/Nairobi', 'IYYY-IW') || ':ompath'), 1, 24);
  else
    person := p_visitor; -- no address available: fall back to the browser's own id
  end if;

  insert into public.site_presence as sp (visitor, member, path, device, last_seen)
  values (person, is_member, left(p_path, 200), left(coalesce(p_device, ''), 20), now())
  on conflict (visitor) do update
    set member = sp.member or excluded.member, path = excluded.path, device = coalesce(nullif(excluded.device, ''), sp.device), last_seen = now();

  if not coalesce(p_beat, false) then
    select count(*) into recent from public.site_visits where visitor = person and at > now() - interval '1 hour';
    if recent < 80 then
      insert into public.site_visits (visitor, member, path, device, ref)
      values (person, is_member, left(p_path, 200), left(coalesce(p_device, ''), 20), left(coalesce(p_ref, ''), 80));
    end if;
  end if;
end;
$$;
revoke all on function public.track_visit(text, text, text, text, boolean) from public;
grant execute on function public.track_visit(text, text, text, text, boolean) to anon, authenticated;


-- 2. Which admission numbers may open the books: a list the admin manages.
-- Each rule is an example-shaped pattern. A student whose admission number matches an ACTIVE rule is verified automatically; anything else waits for the admin.
create table if not exists public.admission_rules (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 2 and 80),
  pattern text not null check (char_length(pattern) between 4 and 300),   -- POSIX regular expression, matched against the typed number in capitals
  replacement text not null check (char_length(replacement) between 1 and 80), -- how the number is saved, e.g. BMS/\1/\2
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.admission_rules enable row level security;
drop policy if exists "admin manages admission rules" on public.admission_rules;
create policy "admin manages admission rules" on public.admission_rules for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- the two formats that worked before
insert into public.admission_rules (label, pattern, replacement)
select 'BMS/2023/60482 (BMS, year, number)', '^BMS[[:space:]/\-_.]*([0-9]{4})[[:space:]/\-_.]*([0-9]{3,6})$', 'BMS/\1/\2'
where not exists (select 1 from public.admission_rules where label like 'BMS/%');
insert into public.admission_rules (label, pattern, replacement)
select 'MBCHB262700349 (MBCHB and 9 digits)', '^MBCHB[[:space:]/\-_.]*([0-9]{9})$', 'MBCHB\1'
where not exists (select 1 from public.admission_rules where label like 'MBCHB%');

-- the check now reads the list (a rule with a broken pattern is skipped, it can never block a sign-up)
create or replace function public.normalize_admission(raw text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  t text := upper(btrim(coalesce(raw, '')));
begin
  if t = '' then return null; end if;
  for r in select pattern, replacement from public.admission_rules where active order by created_at loop
    begin
      if t ~ r.pattern then return regexp_replace(t, r.pattern, r.replacement); end if;
    exception when others then
      null;
    end;
  end loop;
  return null;
end;
$$;
grant execute on function public.normalize_admission(text) to authenticated;
