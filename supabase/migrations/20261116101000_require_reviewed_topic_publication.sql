-- Require a successful independent Gemini review before publishing a new topic page.
-- Existing published rows remain unchanged and cannot be overwritten by this RPC.
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
  review_model text;
  review_rounds smallint;
  generator text;
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

  -- AI approval is separate from the human-reviewed flag.
  if coalesce(p_content->'aiReview'->>'status', '') <> 'passed'
     or nullif(btrim(p_content->'aiReview'->>'model'), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'review');
  end if;
  review_model := left(p_content->'aiReview'->>'model', 60);
  review_rounds := case
    when coalesce(p_content->'aiReview'->>'fixRounds', '0') in ('0', '1', '2')
      then coalesce(p_content->'aiReview'->>'fixRounds', '0')::smallint
    else 0
  end;
  generator := left(coalesce(nullif(p_content->>'model', ''), p_model, 'groq'), 60);

  as_text := p_content::text;
  if as_text ~* '(https?:|www\\.|<[a-z/!]|javascript:|onerror\\s*=|data:text)' then
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

  insert into public.topic_pages (
    slug, name, category, status, content, model, reviewed, updated_at,
    generator_model, ai_review_status, ai_review_model, ai_reviewed_at, ai_review_fix_rounds
  )
  values (
    p_slug, p_name, left(coalesce(p_category, ''), 60), 'published', p_content,
    generator, false, now(), generator, 'passed', review_model, now(), review_rounds
  )
  on conflict (slug) do update
    set content = excluded.content,
        status = 'published',
        model = excluded.model,
        reviewed = false,
        updated_at = now(),
        generator_model = excluded.generator_model,
        ai_review_status = excluded.ai_review_status,
        ai_review_model = excluded.ai_review_model,
        ai_reviewed_at = excluded.ai_reviewed_at,
        ai_review_fix_rounds = excluded.ai_review_fix_rounds
    where public.topic_pages.status <> 'published';

  return jsonb_build_object('ok', true, 'existing', false);
end;
$$;

revoke all on function public.publish_topic_page(text, text, text, jsonb, text) from public;
grant execute on function public.publish_topic_page(text, text, text, jsonb, text) to anon, authenticated;

create index if not exists topic_pages_published_idx
  on public.topic_pages (updated_at desc) where status = 'published';
