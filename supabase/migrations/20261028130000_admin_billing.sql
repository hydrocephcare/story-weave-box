-- Admin billing: one overview of money, the access passes people hold, and a way to give or take back a pass. Every function checks the caller is an administrator.

create or replace function public.admin_billing_overview()
returns jsonb language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Administrators only'; end if;
  select jsonb_build_object(
    'today', coalesce(sum(amount) filter (where payment_status = 'completed' and created_at >= date_trunc('day', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi'), 0),
    'd7',    coalesce(sum(amount) filter (where payment_status = 'completed' and created_at > now() - interval '7 days'), 0),
    'd30',   coalesce(sum(amount) filter (where payment_status = 'completed' and created_at > now() - interval '30 days'), 0),
    'total', coalesce(sum(amount) filter (where payment_status = 'completed'), 0),
    'completed', count(*) filter (where payment_status = 'completed'),
    'failed',    count(*) filter (where payment_status = 'failed'),
    'pending',   count(*) filter (where payment_status not in ('completed', 'failed')),
    'active_passes', (select count(*) from access_grants where expires_at > now()),
    'by_plan', coalesce((select jsonb_agg(jsonb_build_object('plan', coalesce(package_type, 'other'), 'n', n, 'total', t)) from (select package_type, count(*) n, sum(amount) t from payments where payment_status = 'completed' group by 1 order by 3 desc) x), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('d', d, 'total', t) order by d) from (select (created_at at time zone 'Africa/Nairobi')::date d, sum(amount) t from payments where payment_status = 'completed' and created_at > now() - interval '30 days' group by 1) y), '[]'::jsonb)
  ) into out from payments;
  return out;
end $$;

create or replace function public.admin_list_passes(p_limit int default 100)
returns table (id uuid, code text, plan text, email text, expires_at timestamptz, amount numeric, redeem_count int, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Administrators only'; end if;
  return query select g.id, g.code, g.plan, g.email, g.expires_at, g.amount, g.redeem_count, g.created_at from access_grants g order by g.created_at desc limit greatest(1, least(p_limit, 500));
end $$;

create or replace function public.admin_grant_pass(p_email text, p_days int, p_plan text default 'gift')
returns text language plpgsql security definer set search_path = public as $$
declare c text; uid uuid;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Administrators only'; end if;
  if coalesce(trim(p_email), '') = '' or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid e-mail address'; end if;
  if p_days < 1 or p_days > 1100 then raise exception 'Days must be between 1 and 1100'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  c := 'OM-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  insert into access_grants (code, plan, scope, expires_at, email, user_id, allow_download, amount)
  values (c, coalesce(nullif(trim(p_plan), ''), 'gift'), 'all', now() + make_interval(days => p_days), lower(trim(p_email)), uid, true, 0);
  return c;
end $$;

create or replace function public.admin_revoke_pass(p_id uuid default null, p_email text default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Administrators only'; end if;
  if p_id is null and coalesce(trim(p_email), '') = '' then raise exception 'Say which pass'; end if;
  update access_grants set expires_at = now() where expires_at > now() and ((p_id is not null and id = p_id) or (p_id is null and lower(email) = lower(trim(p_email))));
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.admin_billing_overview() from public, anon;
revoke all on function public.admin_list_passes(int) from public, anon;
revoke all on function public.admin_grant_pass(text, int, text) from public, anon;
revoke all on function public.admin_revoke_pass(uuid, text) from public, anon;
grant execute on function public.admin_billing_overview() to authenticated;
grant execute on function public.admin_list_passes(int) to authenticated;
grant execute on function public.admin_grant_pass(text, int, text) to authenticated;
grant execute on function public.admin_revoke_pass(uuid, text) to authenticated;
