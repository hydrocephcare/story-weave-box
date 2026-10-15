-- Autopilot part 2: lets the admin assistant write to the Autopilot log (with an undo recipe), and teaches Undo to put back post descriptions it rewrote.
-- Needs 20261016160000_autopilot.sql first. Safe to run twice.

create or replace function public.admin_agent_log(p_capability text, p_summary text, p_detail jsonb default '{}'::jsonb, p_undo jsonb default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if not public.has_role((select auth.uid()), 'admin') then raise exception 'Administrator access required'; end if;
  insert into public.agent_log (capability, summary, detail, undo) values (left(p_capability, 60), left(p_summary, 600), coalesce(p_detail, '{}'::jsonb), p_undo) returning id into new_id;
  return new_id;
end $$;

create or replace function public.admin_agent_undo(p_log_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare l record; item jsonb;
begin
  if not public.has_role((select auth.uid()), 'admin') then raise exception 'Administrator access required'; end if;
  select * into l from public.agent_log where id = p_log_id and undone_at is null and undo is not null;
  if not found then return; end if;
  if l.undo->>'type' = 'access_back_to_pending' then
    update public.student_access set status = 'pending', note = 'Autopilot approval undone by you', reviewed_at = null where user_id = (l.undo->>'user_id')::uuid;
  elsif l.undo->>'type' = 'article_field' then
    -- only the two SEO fields can be restored this way
    for item in select value from jsonb_array_elements(l.undo->'items') loop
      if l.undo->>'field' = 'meta_description' then update public.articles set meta_description = item->>'old', updated_at = now() where id = (item->>'id')::uuid;
      elsif l.undo->>'field' = 'meta_title' then update public.articles set meta_title = item->>'old', updated_at = now() where id = (item->>'id')::uuid;
      end if;
    end loop;
  end if;
  update public.agent_log set undone_at = now() where id = p_log_id;
end $$;

revoke all on function public.admin_agent_log(text, text, jsonb, jsonb) from public, anon;
grant execute on function public.admin_agent_log(text, text, jsonb, jsonb) to authenticated;
notify pgrst, 'reload schema';
