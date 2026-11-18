alter table public.lite_health_encounters
  add column if not exists clinical_context jsonb not null default '{}'::jsonb;

alter table public.lite_health_encounters
  add constraint lite_health_clinical_context_object
  check (jsonb_typeof(clinical_context) = 'object');
