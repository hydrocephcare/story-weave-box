-- Enforce the 30-day retention window for private Lite health encounters.
-- Guide tokens expire after seven days and are removed independently.
create or replace function public.cleanup_lite_health_data()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed_tokens integer := 0;
  removed_encounters integer := 0;
begin
  delete from public.lite_health_guide_tokens
  where expires_at < now();
  get diagnostics removed_tokens = row_count;

  delete from public.lite_health_encounters
  where expires_at < now();
  get diagnostics removed_encounters = row_count;

  return jsonb_build_object(
    'removed_tokens', removed_tokens,
    'removed_encounters', removed_encounters,
    'ran_at', now()
  );
end;
$$;

revoke all on function public.cleanup_lite_health_data() from public, anon, authenticated;
grant execute on function public.cleanup_lite_health_data() to service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'ompath-lite-health-retention';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'ompath-lite-health-retention',
    '15 2 * * *',
    'select public.cleanup_lite_health_data();'
  );
end;
$$;
