-- Keep the analytics compatibility columns present for the aggregate-only RPCs.
alter table public.site_visits add column if not exists is_admin boolean not null default false;
alter table public.site_presence add column if not exists is_admin boolean not null default false;
create or replace view public.site_visits_eff as
select v.id,v.at,v.day,v.visitor,v.member,'/'::text as path,''::text as device,''::text as ref,
null::text as machine,v.visitor as person,v.is_admin
from public.site_visits v;
revoke all on public.site_visits_eff from public,anon,authenticated;
notify pgrst,'reload schema';
