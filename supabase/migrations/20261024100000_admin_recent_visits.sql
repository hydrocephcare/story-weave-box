-- The admin's live feed of the latest page views (who, what, from where), shown on Admin > Visitors. Admins only.
create or replace function public.admin_recent_visits(p_limit int default 40)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'admin only'; end if;
  return coalesce((
    select jsonb_agg(x) from (
      select at, path, device, member, nullif(ref, '') as ref
      from public.site_visits
      order by at desc
      limit least(greatest(coalesce(p_limit, 40), 1), 100)
    ) x
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_recent_visits(int) from public;
grant execute on function public.admin_recent_visits(int) to authenticated;
