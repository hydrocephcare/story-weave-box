-- Per-student performance from the answers already recorded in user_answers:
-- overall score, score by unit (the MCQ set's category), weakest question sets, and rank among peers.
-- Only the caller's own rows are returned; peers appear only as aggregates (a unit average needs 5+ students).
create or replace function public.my_performance()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then return null; end if;

  with mine as (
    select a.mcq_set_id, a.is_correct, a.created_at, coalesce(nullif(m.category, ''), 'Other') as category, m.title, m.slug
    from public.user_answers a
    join public.mcq_sets m on m.id = a.mcq_set_id
    where a.user_id = uid
  ),
  per_user as (
    select a.user_id, count(*) as answered, avg(case when a.is_correct then 1.0 else 0.0 end) as pct
    from public.user_answers a
    group by a.user_id
    having count(*) >= 20
  ),
  my_overall as (
    select count(*) as answered, count(*) filter (where is_correct) as correct from mine
  ),
  rank_info as (
    select
      (select count(*) from per_user) as peers,
      (select pct from per_user where user_id = uid) as my_pct,
      (select count(*) from per_user p where p.pct < (select pct from per_user where user_id = uid)) as below
  ),
  unit_stats as (
    select category, count(*) as answered, count(*) filter (where is_correct) as correct, max(created_at) as last_at
    from mine group by category
  ),
  unit_peer as (
    select coalesce(nullif(m.category, ''), 'Other') as category,
           count(distinct a.user_id) as students,
           avg(case when a.is_correct then 1.0 else 0.0 end) as pct
    from public.user_answers a join public.mcq_sets m on m.id = a.mcq_set_id
    group by 1
  ),
  set_stats as (
    select mcq_set_id, max(title) as title, max(slug) as slug, max(category) as category,
           count(*) as answered, count(*) filter (where is_correct) as correct
    from mine group by mcq_set_id
    having count(*) >= 3
  )
  select jsonb_build_object(
    'answered', (select answered from my_overall),
    'correct', (select correct from my_overall),
    'peers', (select peers from rank_info),
    'percentile', (select case when my_pct is null or peers < 5 then null else round(100.0 * below / nullif(peers - 1, 0)) end from rank_info),
    'units', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', u.category, 'answered', u.answered, 'correct', u.correct,
        'last_at', u.last_at,
        'peer_pct', case when p.students >= 5 then round(100 * p.pct) else null end
      ) order by u.correct::numeric / u.answered asc) from unit_stats u left join unit_peer p on p.category = u.category
    ), '[]'::jsonb),
    'weak_sets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.mcq_set_id, 'title', s.title, 'slug', s.slug, 'category', s.category,
        'answered', s.answered, 'correct', s.correct
      ) order by s.correct::numeric / s.answered asc, s.answered desc)
      from (select * from set_stats order by correct::numeric / answered asc, answered desc limit 8) s
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.my_performance() from public, anon;
grant execute on function public.my_performance() to authenticated;
