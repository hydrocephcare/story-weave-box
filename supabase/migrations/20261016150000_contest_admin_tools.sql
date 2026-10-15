-- Lets an administrator delete a contest from the site (the browser cannot delete from public.contests directly). Rounds, registrations and results go with it.
create or replace function public.admin_delete_contest(p_slug text)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not public.has_role((select auth.uid()), 'admin') then raise exception 'Administrator access required'; end if;
  delete from public.contests where slug = p_slug;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.admin_delete_contest(text) from public, anon;
grant execute on function public.admin_delete_contest(text) to authenticated;
notify pgrst, 'reload schema';
