-- When true (the default for new contests) a student who registers is admitted straight away, so the admin does not approve each one.
alter table public.contests add column if not exists auto_verify boolean not null default true;
