create table if not exists public.lite_health_guide_tokens (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.lite_health_encounters(id) on delete cascade,
  resource_slug text not null,
  token_hash text not null unique check (length(token_hash) = 64),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz,
  access_count integer not null default 0 check (access_count >= 0)
);

create index if not exists lite_health_guide_tokens_encounter_idx
  on public.lite_health_guide_tokens(encounter_id, created_at desc);
create index if not exists lite_health_guide_tokens_expiry_idx
  on public.lite_health_guide_tokens(expires_at)
  where revoked_at is null;

alter table public.lite_health_guide_tokens enable row level security;
revoke all on public.lite_health_guide_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.lite_health_guide_tokens to service_role;
