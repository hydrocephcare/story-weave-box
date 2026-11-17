-- Lightweight year-scoped catalogue for Lite. Question JSON is fetched only
-- when a learner opens an individual MCQ set.
create or replace function public.lite_sets_for_year(p_year integer)
returns table (
  id uuid,
  title text,
  category text,
  question_count integer,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.title,
    m.category,
    jsonb_array_length(
      case when jsonb_typeof(m.questions) = 'array' then m.questions else '[]'::jsonb end
    )::integer as question_count,
    m.updated_at
  from public.mcq_sets m
  where p_year between 1 and 6
    and m.published = true
    and m.deleted_at is null
    and (
      coalesce(m.title, '') ilike ('%Year ' || p_year::text || '%')
      or coalesce(m.category, '') ilike ('%Year ' || p_year::text || '%')
    )
  order by m.updated_at desc
  limit 500;
$$;
revoke all on function public.lite_sets_for_year(integer) from public, anon, authenticated;
grant execute on function public.lite_sets_for_year(integer) to service_role;
