ALTER TABLE public.access_grants
  ADD COLUMN IF NOT EXISTS devices jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS device_limit integer NOT NULL DEFAULT 2;

INSERT INTO public.app_settings (key, value)
VALUES ('access_plans', '[{"id":"semester","label":"Semester pass (3 months)","price":300,"days":90,"download":true},{"id":"annual","label":"Annual pass (12 months)","price":1000,"days":365,"download":true}]')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;