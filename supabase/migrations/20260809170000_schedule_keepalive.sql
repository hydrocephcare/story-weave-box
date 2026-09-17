-- Best-effort free-tier keep-alive. This makes an actual PostgREST query four
-- times per day. A paid Supabase plan remains the only no-pause guarantee.
DO $$
DECLARE
  existing_job bigint;
BEGIN
  SELECT jobid INTO existing_job
  FROM cron.job
  WHERE jobname = 'supabase-keepalive';

  IF existing_job IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job);
  END IF;
END
$$;

SELECT cron.schedule(
  'supabase-keepalive',
  '17 */6 * * *',
  $keepalive$
    SELECT net.http_get(
      url := 'https://dekyjrfwvavtoivqivno.supabase.co/rest/v1/articles?select=id&published=eq.true&limit=1',
      headers := jsonb_build_object(
        'apikey', 'sb_publishable_jOXeiFMWJj1z_M-zShimXA_cG9f2QxL',
        'Authorization', 'Bearer sb_publishable_jOXeiFMWJj1z_M-zShimXA_cG9f2QxL'
      ),
      timeout_milliseconds := 60000
    );
  $keepalive$
);
