-- ONE file to run (safe to run more than once): deep exam notes v2.
-- The deep notes are now longer (sections, numbers to memorise, viva questions with answers, MCQs, cases). A page that only has the FIRST version
-- of the deep notes (no "vivas" in it) can be upgraded once; a page that already has the new version is never changed.
create or replace function public.save_topic_deep(p_slug text, p_name text, p_category text, p_base jsonb, p_deep jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.topic_pages%rowtype;
  today_count int;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug) > 80 then return jsonb_build_object('ok', false, 'reason', 'slug'); end if;
  if p_deep is null or jsonb_typeof(p_deep) <> 'object' or pg_column_size(p_deep) > 90000 then return jsonb_build_object('ok', false, 'reason', 'size'); end if;
  if jsonb_typeof(p_deep->'sections') <> 'array' or jsonb_typeof(p_deep->'exam') <> 'array'
     or jsonb_array_length(p_deep->'sections') < 4 or jsonb_array_length(p_deep->'sections') > 14
     or jsonb_array_length(p_deep->'exam') < 6 or jsonb_array_length(p_deep->'exam') > 14 then
    return jsonb_build_object('ok', false, 'reason', 'shape');
  end if;
  if p_deep::text ~* '(https?:|www\.|<[a-z/!]|javascript:|onerror\s*=|data:text)' then return jsonb_build_object('ok', false, 'reason', 'unsafe'); end if;

  select * into existing from public.topic_pages where slug = p_slug and status = 'published';
  if found then
    -- the new version is final; only the first version can be replaced
    if existing.content ? 'deep' and (existing.content->'deep') ? 'vivas' then return jsonb_build_object('ok', true, 'existing', true); end if;
    update public.topic_pages set content = (existing.content - 'deep') || jsonb_build_object('deep', p_deep), updated_at = now() where slug = p_slug;
    return jsonb_build_object('ok', true, 'saved', true);
  end if;

  -- no saved page yet: save the page the reader was looking at, with the deep notes
  if p_name is null or length(p_name) < 3 or length(p_name) > 80 or p_name ~ '[<>]' then return jsonb_build_object('ok', false, 'reason', 'name'); end if;
  if p_base is null or jsonb_typeof(p_base) <> 'object' or pg_column_size(p_base) > 60000 or jsonb_typeof(p_base->'sections') <> 'array'
     or jsonb_array_length(p_base->'sections') < 3 or length(coalesce(p_base->>'summary', '')) < 40 then
    return jsonb_build_object('ok', false, 'reason', 'base');
  end if;
  if p_base::text ~* '(https?:|www\.|<[a-z/!]|javascript:|onerror\s*=|data:text)' then return jsonb_build_object('ok', false, 'reason', 'unsafe'); end if;
  select count(*) into today_count from public.topic_pages where created_at > now() - interval '1 day';
  if today_count >= 150 then return jsonb_build_object('ok', false, 'reason', 'busy'); end if;
  insert into public.topic_pages (slug, name, category, status, content, model, reviewed, updated_at)
  values (p_slug, p_name, left(coalesce(p_category, ''), 60), 'published', (p_base - 'deep') || jsonb_build_object('deep', p_deep), 'gemini', false, now())
  on conflict (slug) do nothing;
  return jsonb_build_object('ok', true, 'saved', true);
end;
$$;
revoke all on function public.save_topic_deep(text, text, text, jsonb, jsonb) from public;
grant execute on function public.save_topic_deep(text, text, text, jsonb, jsonb) to anon, authenticated;
