-- Entitlement hardening: assign authenticated creators ownership at insert time,
-- and keep the quota-consumption SECURITY DEFINER RPC unavailable to anonymous callers.
-- Existing rows and existing payment/access-grant records are deliberately untouched.

create or replace function public.set_content_owner_id()
returns trigger
language plpgsql
security invoker
set search_path = public, auth
as $$
begin
  if new.owner_id is null then
    new.owner_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists set_flashcard_set_owner_id on public.flashcard_sets;
create trigger set_flashcard_set_owner_id
before insert on public.flashcard_sets
for each row execute function public.set_content_owner_id();

drop trigger if exists set_mcq_set_owner_id on public.mcq_sets;
create trigger set_mcq_set_owner_id
before insert on public.mcq_sets
for each row execute function public.set_content_owner_id();

create index if not exists flashcard_sets_owner_id_idx
  on public.flashcard_sets(owner_id) where owner_id is not null;
create index if not exists mcq_sets_owner_id_idx
  on public.mcq_sets(owner_id) where owner_id is not null;

revoke all on function public.consume_feature(text, integer) from public;
revoke all on function public.consume_feature(text, integer) from anon;
grant execute on function public.consume_feature(text, integer) to authenticated, service_role;
