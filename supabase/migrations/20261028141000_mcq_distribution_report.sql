-- Monitoring counts for answer-position bias, in the database: how many correct answers sit at A, B, C, D, E in each live MCQ bank.
-- Administrators only, and it returns COUNTS, never which option of which question is right. (The Admin > Tools > Answer positions panel and
-- `npm run mcq:positions -- report` give the richer report; this is the quick SQL view of the same thing.)
--   select * from admin_mcq_distribution(8) where max_share > 0.4 order by max_share desc;   -- banks that need attention
--   select * from admin_mcq_distribution_total();                                             -- the whole site

create or replace function public.admin_mcq_distribution(p_min_questions int default 8)
returns table (id uuid, title text, category text, source_type text, questions int, a int, b int, c int, d int, e int, max_share numeric)
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Administrators only'; end if;
  return query
  select s.id, s.title, s.category, s.source_type, x.n,
         x.ca, x.cb, x.cc, x.cd, x.ce,
         round(greatest(x.ca, x.cb, x.cc, x.cd, x.ce)::numeric / nullif(x.n, 0), 3)
  from mcq_sets s
  cross join lateral (
    select count(*)::int n,
           count(*) filter (where (q->>'correct_answer') = '0')::int ca,
           count(*) filter (where (q->>'correct_answer') = '1')::int cb,
           count(*) filter (where (q->>'correct_answer') = '2')::int cc,
           count(*) filter (where (q->>'correct_answer') = '3')::int cd,
           count(*) filter (where (q->>'correct_answer') = '4')::int ce
    from jsonb_array_elements(case when jsonb_typeof(s.questions) = 'array' then s.questions else '[]'::jsonb end) q
  ) x
  where s.deleted_at is null and x.n >= p_min_questions;
end $$;

create or replace function public.admin_mcq_distribution_total()
returns table (questions bigint, a bigint, b bigint, c bigint, d bigint, e bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Administrators only'; end if;
  return query select sum(x.n)::bigint, sum(x.ca)::bigint, sum(x.cb)::bigint, sum(x.cc)::bigint, sum(x.cd)::bigint, sum(x.ce)::bigint
  from public.admin_mcq_distribution(1) x;
end $$;

revoke all on function public.admin_mcq_distribution(int) from public, anon;
revoke all on function public.admin_mcq_distribution_total() from public, anon;
grant execute on function public.admin_mcq_distribution(int) to authenticated;
grant execute on function public.admin_mcq_distribution_total() to authenticated;
