-- Admin analytics endpoints are intended for authenticated administrators only.
-- Explicitly remove direct anonymous execution; the functions also enforce has_role(..., 'admin').

revoke all on function public.admin_site_stats(integer) from anon, public;
grant execute on function public.admin_site_stats(integer) to authenticated;

revoke all on function public.admin_recent_visits(integer) from anon, public;
grant execute on function public.admin_recent_visits(integer) to authenticated;
