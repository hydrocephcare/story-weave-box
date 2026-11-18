alter table public.lite_health_encounters
  add column if not exists resume_base_answers jsonb not null default '[]'::jsonb;
