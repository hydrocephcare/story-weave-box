-- Catch-up for databases created before the study-profile step existed (the older project the site runs on).
-- Sign-in then asks for name, university, course and year and saves them to "profiles"; without these
-- columns that save fails with a 400 error. Safe to run more than once, and harmless where they already exist.

alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists university text;
alter table public.profiles add column if not exists course text;
alter table public.profiles add column if not exists study_year integer;
alter table public.profiles add column if not exists onboarding_completed boolean not null default false;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- The save is an "upsert on user_id", which needs user_id to be unique.
create unique index if not exists profiles_user_id_unique on public.profiles (user_id);

alter table public.profiles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd in ('INSERT', 'ALL')) then
    create policy "users insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd in ('UPDATE', 'ALL')) then
    create policy "users update own profile" on public.profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd in ('SELECT', 'ALL')) then
    create policy "users read own profile" on public.profiles for select to authenticated using (auth.uid() = user_id);
  end if;
end $$;

grant select, insert, update on public.profiles to authenticated;
