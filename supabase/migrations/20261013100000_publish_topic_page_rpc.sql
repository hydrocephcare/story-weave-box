-- Lets a reader's browser publish a topic page that the AI has just written, safely.
-- The browser cannot write to topic_pages directly. It calls this function, which checks the page, only ever ADDS a page that does not exist
-- yet (it can never overwrite or delete a published page), refuses links and scripts, and stops after a daily number of new pages.
create or replace function public.publish_topic_page(
  p_slug text, p_name text, p_category text, p_content jsonb, p_model text default 'gemini'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.topic_pages%rowtype;
  today_count int;
  n_sections int;
  as_text text;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'slug');
  end if;
  if p_name is null or length(p_name) < 3 or length(p_name) > 80 or p_name ~ '[<>]' then
    return jsonb_build_object('ok', false, 'reason', 'name');
  end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' or pg_column_size(p_content) > 60000 then
    return jsonb_build_object('ok', false, 'reason', 'size');
  end if;
  if jsonb_typeof(p_content->'sections') <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'shape');
  end if;
  n_sections := jsonb_array_length(p_content->'sections');
  if n_sections < 3 or n_sections > 16 or length(coalesce(p_content->>'summary', '')) < 40 then
    return jsonb_build_object('ok', false, 'reason', 'shape');
  end if;
  as_text := p_content::text;
  if as_text ~* '(https?:|www\.|<[a-z/!]|javascript:|onerror\s*=|data:text)' then
    return jsonb_build_object('ok', false, 'reason', 'unsafe');
  end if;

  select * into existing from public.topic_pages where slug = p_slug;
  if found and existing.status = 'published' then
    return jsonb_build_object('ok', true, 'existing', true);
  end if;

  select count(*) into today_count from public.topic_pages where created_at > now() - interval '1 day';
  if today_count >= 150 then
    return jsonb_build_object('ok', false, 'reason', 'busy');
  end if;

  insert into public.topic_pages (slug, name, category, status, content, model, reviewed, updated_at)
  values (p_slug, p_name, left(coalesce(p_category, ''), 60), 'published', p_content, left(coalesce(p_model, 'gemini'), 60), false, now())
  on conflict (slug) do update
    set content = excluded.content, status = 'published', model = excluded.model, updated_at = now()
    where public.topic_pages.status <> 'published';
  return jsonb_build_object('ok', true, 'existing', false);
end;
$$;

revoke all on function public.publish_topic_page(text, text, text, jsonb, text) from public;
grant execute on function public.publish_topic_page(text, text, text, jsonb, text) to anon, authenticated;

-- the sitemap and the home page read the newest published pages
create index if not exists topic_pages_published_idx on public.topic_pages (updated_at desc) where status = 'published';
