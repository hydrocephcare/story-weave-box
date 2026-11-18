-- Lite-only runtime controls. This table contains no provider credentials or patient data.
create table if not exists public.lite_operations_settings (
  id smallint primary key default 1 check (id = 1),
  ussd_enabled boolean not null default true,
  ai_enabled boolean not null default false,
  ai_daily_limit integer not null default 100 check (ai_daily_limit between 0 and 10000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.lite_operations_settings (id, ussd_enabled, ai_enabled, ai_daily_limit)
values (1, true, false, 100)
on conflict (id) do nothing;
alter table public.lite_operations_settings enable row level security;
revoke all on public.lite_operations_settings from public, anon, authenticated;
grant select, insert, update on public.lite_operations_settings to service_role;